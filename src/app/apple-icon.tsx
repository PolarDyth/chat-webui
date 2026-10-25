import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#131313",
        }}
      >
        <div
          style={{
            width: 96,
            height: 72,
            borderLeft: "17px solid #fafafa",
            borderRight: "17px solid #fafafa",
            borderBottom: "17px solid #fafafa",
            borderBottomLeftRadius: 48,
            borderBottomRightRadius: 48,
            display: "flex",
          }}
        />
      </div>
    ),
    size
  );
}
