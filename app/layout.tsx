import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("http://www.yyy301.com:7777"),
  title: "灿乐祥动力网",
  description: "重庆灿乐祥科技有限公司企业门户",
  openGraph: {
    title: "灿乐祥动力网",
    description: "洞察产业趋势，连接商业增长",
    images: ["/assets/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "灿乐祥动力网",
    description: "洞察产业趋势，连接商业增长",
    images: ["/assets/og.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#e16b3d",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
