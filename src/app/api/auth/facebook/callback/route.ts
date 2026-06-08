import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFacebookPages } from "@/lib/platforms/facebook";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?error=no_code`);

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/facebook/callback`;

  const tokenRes = await fetch(
    `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${process.env.FACEBOOK_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${process.env.FACEBOOK_APP_SECRET}&code=${code}`
  );
  const tokenData = await tokenRes.json() as { access_token?: string; error?: { message: string } };
  if (tokenData.error || !tokenData.access_token) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?error=token_failed`);
  }

  const pages = await getFacebookPages(tokenData.access_token) as Array<{
    id: string;
    name: string;
    access_token: string;
  }>;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/login`);

  for (const page of pages) {
    await supabase.from("connected_accounts").upsert({
      user_id: user.id,
      platform: "facebook" as const,
      account_name: page.name,
      account_id: page.id,
      page_id: page.id,
      page_name: page.name,
      access_token: page.access_token,
      refresh_token: null,
      token_expires_at: null,
      is_active: true,
    }, { onConflict: "user_id,platform,account_id" });
  }

  return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?success=facebook`);
}
