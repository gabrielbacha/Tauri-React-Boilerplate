import type { ReactElement, ReactNode } from "react";

export default function DemoPanel({
  title,
  description,
  wide,
  children,
}: {
  title: string;
  description: string;
  wide?: boolean;
  children: ReactNode;
}): ReactElement {
  return (
    <section className={`demo-panel${wide ? " demo-panel-wide" : ""}`} aria-label={title}>
      <header>
        <h2>{title}</h2>
        <p>{description}</p>
      </header>
      {children}
    </section>
  );
}
