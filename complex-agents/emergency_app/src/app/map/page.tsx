import { cookies } from "next/headers";
import { SentinelApp } from "@/components/sentinel-app";
import { operatorFromCookie } from "@/server/auth";
import { getRuntimeEnv } from "@/server/env";

export const dynamic = "force-dynamic";

export default async function MapPage() {
  const env = await getRuntimeEnv();
  const operator = await operatorFromCookie((await cookies()).toString(), env);
  return <SentinelApp initialOperator={operator} />;
}
