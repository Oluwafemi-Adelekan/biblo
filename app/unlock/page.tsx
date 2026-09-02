import { UnlockForm } from "@/components/UnlockForm";

export const dynamic = "force-dynamic";

export default async function Unlock({
  searchParams,
}: {
  searchParams: Promise<{ to?: string }>;
}) {
  const { to } = await searchParams;
  return <UnlockForm to={to ?? "/"} />;
}
