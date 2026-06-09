import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'שלי צעצועים — בוט סיטונאים',
  description: 'POC לפגישה עם אביחי',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif', background: '#f5f5f5' }}>
        {children}
      </body>
    </html>
  )
}
