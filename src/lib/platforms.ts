import type { Platform } from "@/types/database";

export const PLATFORM_CONFIG: Record<Platform, {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  charLimit: number;
}> = {
  facebook: {
    label: "Facebook",
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
    charLimit: 63206,
  },
  instagram: {
    label: "Instagram",
    color: "text-pink-600",
    bgColor: "bg-pink-50",
    borderColor: "border-pink-200",
    charLimit: 2200,
  },
  linkedin: {
    label: "LinkedIn",
    color: "text-sky-700",
    bgColor: "bg-sky-50",
    borderColor: "border-sky-200",
    charLimit: 3000,
  },
  houzz: {
    label: "Houzz",
    color: "text-green-700",
    bgColor: "bg-green-50",
    borderColor: "border-green-200",
    charLimit: 2000,
  },
};

export const ALL_PLATFORMS: Platform[] = ["facebook", "instagram", "linkedin", "houzz"];
