import { useDesktop } from "../context/DesktopContext";

export default function StarterPage() {
  const { appInfo } = useDesktop();
  return (
    <section className="p-8" aria-label="Application workspace">
      <h1 className="text-2xl font-semibold">{appInfo?.name}</h1>
      <p className="mt-2 text-muted-foreground">Your workspace is ready.</p>
    </section>
  );
}
