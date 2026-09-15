import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client, ListBucketsCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3Client = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION || 'us-east-1',
    credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY || '',
        secretAccessKey: process.env.S3_SECRET_KEY || ''
    },
    forcePathStyle: true
});

async function uploadFile(buffer: Buffer, key: string, contentType: string, bucket?: string): Promise<string> {
    await s3Client.send(
        new PutObjectCommand({
            Bucket: bucket || process.env.S3_BUCKET_NAME!,
            Key: key,
            Body: buffer,
            ContentType: contentType
        })
    );

    return key;
}

async function getFile(key: string): Promise<{ buffer: Buffer; contentType?: string }> {
    try {
        const response = await s3Client.send(
            new GetObjectCommand({
                Bucket: process.env.S3_BUCKET_NAME!,
                Key: key
            })
        );

        if (!response.Body) {
            throw new Error(`File not found: ${key}`);
        }

        // Convert the stream to a buffer
        const buffer = Buffer.from(await response.Body.transformToByteArray());

        return {
            buffer,
            contentType: response.ContentType
        };
    } catch (err: any) {
        // Handle S3 specific errors
        if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
            throw new Error(`File not found: ${key}`);
        }
        throw err;
    }
}

async function deleteFile(key: string, bucket?: string): Promise<void> {
    await s3Client.send(
        new DeleteObjectCommand({
            Bucket: bucket || process.env.S3_BUCKET_NAME!,
            Key: key
        })
    );
}

async function getSignedURL(key: string, options?: { expiresIn: number }) {
    const command = new GetObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME!,
        Key: key
    });
    return getSignedUrl(s3Client, command, options);
}

async function healthCheck() {
    try {
        await s3Client.send(new ListBucketsCommand({}));
        return true;
    } catch (e) {
        return false;
    }
}

const s3 = {
    uploadFile,
    getFile,
    deleteFile,
    getSignedURL,
    healthCheck
}

export default s3;