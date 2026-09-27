import { loadEnvConfig } from "@next/env";
import { parsePublicEnv } from "../src/config/env-schema";
import { parseClickPesaConfig } from "../src/services/payments/clickpesa-config";
import { parseGramvistaConfig } from "../src/services/sms/gramvista-config";

loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
try {
  parsePublicEnv(process.env);
  const provider = process.env.PAYMENT_PROVIDER || "pending";
  if (!["pending", "mock", "clickpesa"].includes(provider)) throw new Error("Invalid PAYMENT_PROVIDER. See .env.example.");
  if (provider === "clickpesa") parseClickPesaConfig(process.env);
  if (provider === "mock" && process.env.NODE_ENV === "production") throw new Error("Mock payment provider is not allowed in production.");
  const smsProvider = process.env.SMS_PROVIDER || "disabled";
  if (!["disabled", "mock", "gramvista"].includes(smsProvider)) throw new Error("Invalid SMS_PROVIDER. See .env.example.");
  if (smsProvider === "gramvista") parseGramvistaConfig(process.env);
  if (smsProvider === "mock" && process.env.NODE_ENV === "production") throw new Error("Mock SMS provider is not allowed in production.");
  console.log("Environment configuration is valid. Provider connectivity has not been tested.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Environment validation failed.");
  process.exitCode = 1;
}
