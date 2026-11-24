import { IMPORT_COLUMNS } from "@/server/import-inventory";

export function GET() {
  const sample = [
    IMPORT_COLUMNS.join(","),
    "UNIT,TA,TA-1201,12,,,CONDO,1BR Deluxe,38.5,,1,1,City view,,,4850000,",
    "UNIT,B1,B1-L05,,1,5,HOUSE_AND_LOT,Amber,72,120,3,2,North,,,6200000,Corner lot",
    "PARKING,TA,P2-031,,,,,,,,,,,REGULAR,P2,850000,",
  ].join("\n");
  return new Response(sample, { headers: { "Content-Type": "text/csv", "Content-Disposition": 'attachment; filename="inventory-import-template.csv"' } });
}
