import * as SimpleIcons from 'simple-icons'

// 主要なSNSの定義
export type PredefinedSNS = {
  id: string
  name: string
  defaultUrl: string
  icon: string
}

export const PREDEFINED_SNS: PredefinedSNS[] = [
  { id: 'youtube', name: 'YouTube', defaultUrl: 'https://www.youtube.com/', icon: '📺' },
  { id: 'x', name: 'X (Twitter)', defaultUrl: 'https://x.com/', icon: '❌' },
  { id: 'instagram', name: 'Instagram', defaultUrl: 'https://www.instagram.com/', icon: '📷' },
  { id: 'tiktok', name: 'TikTok', defaultUrl: 'https://www.tiktok.com/', icon: '🎵' },
  { id: 'facebook', name: 'Facebook', defaultUrl: 'https://www.facebook.com/', icon: '👥' },
  { id: 'line', name: 'LINE', defaultUrl: 'https://line.me/', icon: '💬' },
  { id: 'discord', name: 'Discord', defaultUrl: 'https://discord.com/', icon: '🎮' },
  { id: 'twitch', name: 'Twitch', defaultUrl: 'https://www.twitch.tv/', icon: '🎬' },
  { id: 'reddit', name: 'Reddit', defaultUrl: 'https://www.reddit.com/', icon: '🤖' },
  { id: 'github', name: 'GitHub', defaultUrl: 'https://github.com/', icon: '💻' },
  { id: 'note', name: 'note', defaultUrl: 'https://note.com/', icon: '📝' },
  { id: 'zenn', name: 'Zenn', defaultUrl: 'https://zenn.dev/', icon: '⚡' },
  { id: 'qiita', name: 'Qiita', defaultUrl: 'https://qiita.com/', icon: '📚' },
  { id: 'niconico', name: 'ニコニコ動画', defaultUrl: 'https://www.nicovideo.jp/', icon: '📹' },
  { id: 'pixiv', name: 'pixiv', defaultUrl: 'https://www.pixiv.net/', icon: '🎨' },
  { id: 'amazon', name: 'Amazon', defaultUrl: 'https://www.amazon.co.jp/', icon: '📦' },
]

// SNS IDからSimple Iconsのアイコンを取得
export const getSNSIcon = (snsId: string): { svg: string; color: string } | null => {
  const iconMap: Record<string, string> = {
    'youtube': 'siYoutube',
    'x': 'siX',
    'instagram': 'siInstagram',
    'tiktok': 'siTiktok',
    'facebook': 'siFacebook',
    'line': 'siLine',
    'discord': 'siDiscord',
    'twitch': 'siTwitch',
    'reddit': 'siReddit',
    'github': 'siGithub',
    'note': 'siNote',
    'zenn': 'siZenn',
    'qiita': 'siQiita',
    'niconico': 'siNiconico',
    'pixiv': 'siPixiv',
    'amazon': 'siAmazon',
  }

  // simple-icons から削除されたブランドの独自フォールバック
  if (snsId === 'amazon') {
    return {
      svg: '<svg role="img" viewBox="0 0 448 512" xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path d="M257.2 162.7c-48.7 1.8-169.5 15.5-169.5 117.5 0 109.5 138.3 114 183.5 43.2 6.5 10.2 35.4 37.5 45.3 46.8l56.8-56S341 288.9 341 261.4V114.3C341 89 316.5 32 228.7 32 140.7 32 94 87 94 136.3l73.5 6.8c16.3-49.5 54.2-49.5 54.2-49.5 40.7-.1 35.5 29.8 35.5 69.1zm0 86.8c0 80-84.2 68-84.2 17.2 0-47.2 50.5-56.7 84.2-57.8v40.6zm136 163.5c-7.7 10-70 67-174.5 67S34.2 408.5 9.7 379c-6.8-7.7 1-11.3 5.5-8.3C88.5 415.2 203 488.5 387.7 401c7.5-3.7 13.3 2 5.5 12zm39.8 2.2c-6.5 15.8-16 26.8-21.2 31-5.5 4.5-9.5 2.7-6.5-3.8s19.3-46.5 12.7-55c-6.5-8.3-37-4.3-48-3.2-10.8 1-13 2-14-.3-2.3-5.7 21.7-15.5 37.5-17.5 15.7-1.8 41-.8 46 5.7 3.7 5.1 0 27.1-6.5 43.1z"/></svg>',
      color: '#FF9900'
    }
  }

  const iconKey = iconMap[snsId]
  if (iconKey && iconKey in SimpleIcons) {
    const icon = SimpleIcons[iconKey as keyof typeof SimpleIcons] as SimpleIcons.SimpleIcon
    return {
      svg: icon.svg,
      color: `#${icon.hex}`
    }
  }

  return null
}
