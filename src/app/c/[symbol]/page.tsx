import { CompanyView } from "@/components/CompanyView";

export default async function Page(props: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await props.params;
  return <CompanyView symbol={decodeURIComponent(symbol).toUpperCase()} />;
}
