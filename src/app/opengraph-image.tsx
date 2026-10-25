import { ImageResponse } from "next/og";

export const alt = "Unwall — AI without the paywall";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#101010",
        }}
      >
        <div
          style={{
            width: 150,
            height: 112,
            borderLeft: "26px solid #a9f0c6",
            borderRight: "26px solid #a9f0c6",
            borderBottom: "26px solid #a9f0c6",
            borderBottomLeftRadius: 75,
            borderBottomRightRadius: 75,
            display: "flex",
            marginBottom: 44,
          }}
        />
        <div
          style={{
            display: "flex",
            fontSize: 96,
            fontWeight: 700,
            color: "#fafafa",
            letterSpacing: -2,
          }}
        >
          Unwall
        </div>
        <div style={{ display: "flex", fontSize: 40, color: "#a1a1aa", marginTop: 18 }}>
          AI without the paywall.
        </div>
        <div style={{ display: "flex", fontSize: 26, color: "#71717a", marginTop: 56 }}>
          unwall.it
        </div>
      </div>
    ),
    size
  );
}
