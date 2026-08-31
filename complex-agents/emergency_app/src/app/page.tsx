import { cookies } from "next/headers";
import { SentinelApp } from "@/components/sentinel-app";
import { operatorFromCookie } from "@/server/auth";
import { getRuntimeEnv } from "@/server/env";

export const dynamic = "force-dynamic";

export default async function Page() {
  const cookieStore = await cookies();
  const env = await getRuntimeEnv();
  const operator = await operatorFromCookie(cookieStore.toString(), env);

  return <SentinelApp initialOperator={operator} />;
}
