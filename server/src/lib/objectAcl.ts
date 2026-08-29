import { File } from "@google-cloud/storage";

const ACL_POLICY_METADATA_KEY = "custom:aclPolicy";

export interface ObjectAclPolicy {
  owner: string;
  visibility: "public" | "private";
}

export async function getObjectAclPolicy(
  file: File,
): Promise<ObjectAclPolicy | null> {
  try {
    const [metadata] = await file.getMetadata();
    const raw = metadata.metadata?.[ACL_POLICY_METADATA_KEY];
    if (!raw || typeof raw !== "string") return null;
    return JSON.parse(raw) as ObjectAclPolicy;
  } catch {
    return null;
  }
}
