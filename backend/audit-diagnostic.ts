import { prisma } from "./src/database/prisma";
import { auditService } from "./src/services/auditService";

async function main() {
  const result = await auditService.verifyAuditChainIntegrity();
  console.log("VERIFICATION:", result);

  const logs = await prisma.auditLedger.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      action: true,
      createdAt: true,
      prevHash: true,
      currentHash: true,
      payload: true
    }
  });

  console.log("RECORDS:", JSON.stringify(logs, null, 2));
}

main()
  .catch(console.error)
  .finally(async () => await prisma.$disconnect());
