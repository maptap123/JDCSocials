import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?error=no_code`);

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/linkedin/callback`;

  const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: process.env.LINKEDIN_CLIENT_ID!,
      client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
    }),
  });
  const tokenData = await tokenRes.json() as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!tokenData.access_token) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?error=token_failed`);
  }

  const profileRes = await fetch("https://api.linkedin.com/v2/me", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const profile = await profileRes.json() as {
    id: string;
    localizedFirstName: string;
    localizedLastName: string;
  };

  const orgRes = await fetch(
    "https://api.linkedin.com/v2/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&projection=(elements*(organization~(id,localizedName)))",
    { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
  );
  const orgData = await orgRes.json() as {
    elements?: Array<{ "organization~": { id: number; localizedName: string } }>;
  };
  const org = orgData.elements?.[0]?.["organization~"];

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/login`);

  const expiresAt = tokenData.expires_in
    ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
    : null;

  await supabase.from("connected_accounts").upsert({
    user_id: user.id,
    platform: "linkedin" as const,
    account_name: `${profile.localizedFirstName} ${profile.localizedLastName}`,
    account_id: profile.id,
    page_id: org ? `urn:li:organization:${org.id}` : null,
    page_name: org?.localizedName ?? null,
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token ?? null,
    token_expires_at: expiresAt,
    is_active: true,
  }, { onConflict: "user_id,platform,account_id" });

  return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?success=linkedin`);
}
