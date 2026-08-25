import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#081224",
          color: "#67e8f9",
          fontSize: 16,
          fontWeight: 700,
          borderRadius: 8,
        }}
      >
        AA
      </div>
    ),
    size,
  );
}
