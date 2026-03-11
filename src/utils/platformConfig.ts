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
    name: "BiliBili",
    icon: "📺",
    urlPattern: /bilibili\.com|b23\.tv/i,
    placeholder: "https://www.bilibili.com/video/..."
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

// 别名映射：处理旧数据库中存储的非规范平台名
const PLATFORM_ALIASES: Record<string, string> = {
  "twitter": "Twitter/X",
  "x": "Twitter/X",
  "bilibili": "BiliBili",
  "youtube": "YouTube",
  "tiktok": "TikTok",
  "instagram": "Instagram",
  "facebook": "Facebook",
  "reddit": "Reddit",
  "linkedin": "LinkedIn",
  "weibo": "微博",
  "zhihu": "知乎",
  "tieba": "贴吧",
  "xiaohongshu": "小红书",
};

/**
 * Get platform config by name (with alias fallback)
 */
export function getPlatformByNameWithAlias(name: string): PlatformConfig | undefined {
  const direct = getPlatformByName(name);
  if (direct) return direct;
  const canonical = PLATFORM_ALIASES[name.toLowerCase()];
  return canonical ? getPlatformByName(canonical) : undefined;
}

/**
 * Get platform icon (with alias fallback for legacy stored names)
 */
export function getPlatformIcon(platformName?: string): string {
  if (!platformName) return "🌐";
  const platform = getPlatformByNameWithAlias(platformName);
  return platform?.icon || "🌐";
}
