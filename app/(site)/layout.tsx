import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="site">
      <a href="#innhold" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 btn">
        Hopp til innhold
      </a>
      <SiteHeader />
      <main id="innhold" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-10">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
