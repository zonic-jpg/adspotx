/**
 * Legacy hero proxy — unused while /hero-demo.mp4 is served as a static
 * explainer from app/public. Kept so old redirects / clients do not 404 the function path.
 */
const REMOTES = [
  "https://videos.pexels.com/video-files/3195394/3195394-sd_640_360_25fps.mp4",
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
    statusCode: 302,
    headers: {
      Location: "/hero-demo.mp4",
      "Access-Control-Allow-Origin": "*",
    },
    body: "",
  };
}
