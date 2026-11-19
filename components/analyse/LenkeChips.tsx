import Link from "next/link";
import { tall } from "@/lib/chart";
import { KATEGORI_EMOJI } from "@/lib/classify";
import { lokalUrlSti, type LokalSide } from "@/lib/server/lokal";

/** Lenker til lokale sider som brikker, med antall steder. */
export default function LenkeChips({ sider }: { sider: LokalSide[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {sider.map((s) => (
        <li key={s.slug}>
          <Link className="chip" href={lokalUrlSti(s)}>
            {s.kategori ? KATEGORI_EMOJI[s.kategori] : "🏘️"} {s.navn}
            <span className="text-ink-soft">{tall(s.steder.length)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
