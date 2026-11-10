import { Link } from "react-router-dom";
import { brassEdge, color, font, radius } from "../theme/tokens";

/** A temporary signboard for screens not yet ported, so navigation works and
 *  the flow can be screenshotted. Replaced screen by screen through M2. */
export function Placeholder({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "radial-gradient(120% 90% at 50% 10%, #33506b 0%, #27384a 42%, #1e242b 100%)",
      }}
    >
      <section
        style={{
          background: "rgba(47,54,64,0.96)",
          border: brassEdge,
          borderRadius: radius.panel,
          padding: "32px 36px",
          maxWidth: 460,
          width: "100%",
          textAlign: "center",
          boxShadow: "0 20px 50px rgba(0,0,0,0.4)",
        }}
      >
        <h2 style={{ fontFamily: font.display, fontSize: 32, color: color.linen, marginBottom: 10 }}>{title}</h2>
        <p style={{ color: color.textSecondary, fontSize: 16, lineHeight: 1.45, margin: "0 0 22px" }}>{blurb}</p>
        <Link
          to="/"
          style={{
            display: "inline-block",
            padding: "12px 20px",
            background: color.wheat,
            color: color.millstone,
            borderRadius: radius.md,
            fontWeight: 700,
            textDecoration: "none",
            boxShadow: `0 3px 0 ${color.wheatShadow}`,
          }}
        >
          Back to title
        </Link>
      </section>
    </div>
  );
}
