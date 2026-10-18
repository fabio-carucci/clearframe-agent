import { GetObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import type { JsonReader } from "@clearframe/core/catalog/load";

export const s3JsonReader =
  (s3: Pick<S3Client, "send">, bucket: string, prefix: string): JsonReader =>
  async (file) => {
    const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: `${prefix}${file}` }));
    const body = await object.Body?.transformToString();
    if (body === undefined) throw new Error(`Empty S3 object s3://${bucket}/${prefix}${file}`);
    return JSON.parse(body);
  };
