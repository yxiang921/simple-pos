import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { patternSummary } from "@/lib/patterns";
import { EmptyState, PageHeader, Panel, PanelHeader, Table, TD, TH, THead, TR } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Data sources" };

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default async function DataSourcesPage() {
  const p = patternSummary();
  const [orders, prep, soldOuts, expenses, oldest] = await Promise.all([
    prisma.order.count({ where: { isSimulated: true } }),
    prisma.dailyPrep.count({ where: { isSimulated: true } }),
    prisma.soldOutEvent.count({ where: { isSimulated: true } }),
    prisma.expense.count({ where: { isSimulated: true } }),
    prisma.order.findFirst({ where: { isSimulated: true }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
  ]);

  return (
    <>
      <PageHeader
        title="Data sources"
        description="The patterns in the order history — weekdays, seasons, time of day, daily ups and downs — come from the public datasets below."
      />
      {!p ? (
        <Panel>
          <EmptyState title="No pattern file" description="Run `npm run patterns:build -- --source=<bossbuddy-public-data folder>` to create data/real-patterns.json." />
        </Panel>
      ) : (
        <div className="grid max-w-6xl gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-5">
            <Panel>
              <PanelHeader title="Attribution (CC BY 4.0 — copy onto slides)" />
              <p className="select-all px-4 py-3 text-[13px] leading-relaxed">{p.attribution.replace(/^Simulated shop\.\s*/, "")}</p>
            </Panel>

            <Panel>
              <PanelHeader title="What each dataset is used for" />
              <Table>
                <THead>
                  <tr>
                    <TH>Dataset</TH>
                    <TH>Used for</TH>
                    <TH>Licence</TH>
                  </tr>
                </THead>
                <tbody>
                  {p.sources.map((s) => (
                    <TR key={s.key}>
                      <TD className="max-w-[320px]">
                        <a href={s.url} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
                          {s.name}
                        </a>
                        <p className="text-[12px] text-muted">{s.citation}</p>
                      </TD>
                      <TD>{s.used}</TD>
                      <TD className="whitespace-nowrap text-muted">{s.license}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </Panel>

            <Panel>
              <PanelHeader title="Patterns taken from the data" />
              <div className="space-y-4 px-4 py-3 text-[13px]">
                <div>
                  <p className="mb-1.5 font-medium">Day of week (Yaz, {p.yaz.days} days, {p.yaz.from} → {p.yaz.to})</p>
                  <div className="grid grid-cols-7 border-l border-t border-line text-center">
                    {p.yaz.weekday.map((v, i) => (
                      <div key={i} className="border-b border-r border-line py-1.5">
                        <p className="text-[11px] text-muted">{DAYS[i]}</p>
                        <p className="tabular font-semibold">×{v.toFixed(2)}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 font-medium">JB season by month (Singapore residents entering Johor, {"Imigresen"})</p>
                  <div className="grid grid-cols-12 border-l border-t border-line text-center">
                    {p.malaysia.seasonByMonth.map((v, i) => (
                      <div key={i} className="border-b border-r border-line py-1.5">
                        <p className="text-[11px] text-muted">{MONTHS[i]}</p>
                        <p className="tabular text-[12px] font-semibold">{v.toFixed(2)}</p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-1 text-[12px] text-muted">Applied at half strength (a JB shop doesn&apos;t follow every Singapore visitor).</p>
                </div>
                <ul className="list-disc space-y-1 pl-5 text-muted">
                  <li>
                    Shop size: RM {p.malaysia.revenuePerEmployeeDay} revenue per F&amp;B worker per day (DOSM, four quarters to {p.malaysia.latestQuarter}) ×
                    the number of salaried staff in Costs.
                  </li>
                  <li>
                    Order size: {Object.entries(p.indonesia.basket).map(([k, v]) => `${Math.round(v * 100)}% with ${k} item${k === "1" ? "" : "s"}`).join(", ")}; mix{" "}
                    {Math.round(p.indonesia.mix.drink * 100)}% drinks, {Math.round(p.indonesia.mix.main * 100)}% mains, {Math.round(p.indonesia.mix.snack * 100)}% snacks
                    (Indonesian POS, {p.indonesia.receipts.toLocaleString()} receipts).
                  </li>
                  <li>
                    Daily JB crowd: KTMB Tebrau shuttle ridership on the same date, compared with its usual weekday ({p.malaysia.ktmbDays.toLocaleString()} days,{" "}
                    {p.malaysia.ktmbFrom} → {p.malaysia.ktmbTo}), at half strength.
                  </li>
                  <li>
                    Limitation: the Indonesian dataset shows the same item mix every hour and no weekday differences, so it looks anonymised. Only its order
                    sizes, food/drink mix, daily swings and broad hour curve are used.
                  </li>
                </ul>
              </div>
            </Panel>
          </div>

          <Panel className="h-fit">
            <PanelHeader title="Generated history in this database" />
            <dl className="divide-y divide-line text-[13px]">
              {[
                ["Orders", orders],
                ["Daily prep rows", prep],
                ["Sold-out events", soldOuts],
                ["Running costs", expenses],
              ].map(([k, v]) => (
                <div key={k as string} className="flex justify-between px-4 py-2">
                  <dt className="text-muted">{k}</dt>
                  <dd className="tabular font-medium">{(v as number).toLocaleString()}</dd>
                </div>
              ))}
            </dl>
            <div className="space-y-1.5 border-t border-line px-4 py-3 text-[12px] text-muted">
              {oldest && <p>History starts {oldest.createdAt.toISOString().slice(0, 10)}.</p>}
              <p>Generated rows are flagged in the database so they can be told apart from real orders. Real orders, prep entries and stock are never changed by the generator.</p>
              <p>
                Regenerate: <code className="text-ink">npm run demo:history -- --reset</code>. Patterns built {p.generatedAt.slice(0, 10)}.
              </p>
            </div>
          </Panel>
        </div>
      )}
    </>
  );
}
