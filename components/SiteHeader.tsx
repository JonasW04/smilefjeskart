import Link from "next/link";
import NavLinks from "./NavLinks";
import Smiley from "./Smiley";

export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b-2 border-line bg-paper/90 backdrop-blur">
      <nav
        aria-label="Hovedmeny"
        className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2.5"
      >
        <Link href="/" className="group flex items-center gap-2" aria-label="Smilefjeskartet – til kartet">
          <span className="wobble inline-block -rotate-6 transition-transform group-hover:rotate-0">
            <Smiley kind="smil" size={34} />
          </span>
          <span className="font-display text-xl font-extrabold tracking-tight">
            Smilefjes<span className="text-accent">kartet</span>
          </span>
        </Link>
        <NavLinks />
      </nav>
    </header>
  );
}
