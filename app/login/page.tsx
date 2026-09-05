import { LoginForm } from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ to?: string }>;
}) {
  const { to } = await searchParams;
  return <LoginForm to={to ?? "/"} />;
}
