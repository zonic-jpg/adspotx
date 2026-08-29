/**
 * Same-origin hero demo clip — proxies African editorial MP4 for landing preview.
 * Mixkit blocks client fetches; Pexels works from browser and Netlify function runtime.
 */
const REMOTES = [
  "https://videos.pexels.com/video-files/3195394/3195394-sd_640_360_25fps.mp4",
  "https://videos.pexels.com/video-files/3195394/3195394-uhd_2560_1440_25fps.mp4",
  "https://assets.mixkit.co/videos/preview/mixkit-black-model-through-acrylic-101633-large.mp4",
];

export async function handler() {
  for (const url of REMOTES) {
    try {
      const res = await fetch(url, {
        redirect: "follow",
        headers: { "User-Agent": "AdSpotX-Hero/1.0" },
      });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1000) continue;
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "video/mp4",
          "Cache-Control": "public, max-age=86400",
          "Access-Control-Allow-Origin": "*",
        },
        body: buf.toString("base64"),
        isBase64Encoded: true,
      };
    } catch {
      /* try next */
    }
  }

  return {
    statusCode: 502,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({ error: "hero_video_unavailable" }),
  };
}
