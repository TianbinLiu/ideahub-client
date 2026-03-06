/**
 * Platform configuration for external sources
 * Maps platform names to their icons and URL patterns
 */

export type PlatformConfig = {
  name: string;
  icon: string;
  urlPattern?: RegExp;
  placeholder?: string;
};

export const PLATFORMS: PlatformConfig[] = [
  {
    name: "贴吧",
    icon: "🏮",
    urlPattern: /tieba\.baidu\.com/i,
    placeholder: "https://tieba.baidu.com/p/..."
  },
  {
    name: "知乎",
    icon: "📘",
    urlPattern: /zhihu\.com/i,
    placeholder: "https://www.zhihu.com/question/..."
  },
  {
    name: "小红书",
    icon: "📕",
    urlPattern: /xiaohongshu\.com|xhslink\.com/i,
    placeholder: "https://www.xiaohongshu.com/..."
  },
  {
    name: "微博",
    icon: "🐦",
    urlPattern: /weibo\.com/i,
    placeholder: "https://weibo.com/..."
  },
  {
    name: "Facebook",
    icon: "👥",
    urlPattern: /facebook\.com|fb\.com/i,
    placeholder: "https://www.facebook.com/..."
  },
  {
    name: "Twitter/X",
    icon: "🐤",
    urlPattern: /twitter\.com|x\.com/i,
    placeholder: "https://twitter.com/..."
  },
  {
    name: "Reddit",
    icon: "🤖",
    urlPattern: /reddit\.com/i,
    placeholder: "https://www.reddit.com/r/..."
  },
  {
    name: "Instagram",
    icon: "📷",
    urlPattern: /instagram\.com/i,
    placeholder: "https://www.instagram.com/p/..."
  },
  {
    name: "YouTube",
    icon: "📹",
    urlPattern: /youtube\.com|youtu\.be/i,
    placeholder: "https://www.youtube.com/watch?v=..."
  },
  {
    name: "TikTok",
    icon: "🎵",
    urlPattern: /tiktok\.com/i,
    placeholder: "https://www.tiktok.com/@..."
  },
  {
    name: "LinkedIn",
    icon: "💼",
    urlPattern: /linkedin\.com/i,
    placeholder: "https://www.linkedin.com/posts/..."
  },
  {
    name: "其他",
    icon: "🌐",
    placeholder: "https://..."
  }
];

/**
 * Get platform config by name
 */
export function getPlatformByName(name: string): PlatformConfig | undefined {
  return PLATFORMS.find(p => p.name.toLowerCase() === name.toLowerCase());
}

/**
 * Detect platform from URL
 */
export function detectPlatformFromUrl(url: string): PlatformConfig | null {
  if (!url) return null;
  
  for (const platform of PLATFORMS) {
    if (platform.urlPattern && platform.urlPattern.test(url)) {
      return platform;
    }
  }
  
  return null;
}

/**
 * Get platform icon (with fallback)
 */
export function getPlatformIcon(platformName?: string): string {
  if (!platformName) return "🌐";
  
  const platform = getPlatformByName(platformName);
  return platform?.icon || "🌐";
}
