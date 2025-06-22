import { NextFunction, Request, Response, Router } from "express";
import { ModuleInitializer } from "if-types";
import { existsSync, mkdirSync } from "node:fs";
import multer, { MulterError } from "multer";
import path from "node:path";
import createHttpError, { isHttpError } from "http-errors";
import { Collection, ObjectId } from "mongodb";
import { fileTypeFromBuffer } from "file-type";
import { readFile, writeFile } from "node:fs/promises";

interface FileMetadata {
  id: ObjectId;
  type?: string;
  filename: string;
  path: string;
  uploadedAt: Date;
}

interface FileMetadataView {
  id: string;
  type?: string;
  filename: string;
  uploadedAt: string;
}

const dataDir = "data/kb-files";

function mapFileMetadataToFileMetadataView(
  fileMetadata: FileMetadata
): FileMetadataView {
  return {
    id: fileMetadata.id.toString(),
    type: fileMetadata.type,
    filename: fileMetadata.filename,
    uploadedAt: fileMetadata.uploadedAt.toISOString(),
  };
}

const moduleInitializer: ModuleInitializer = async (ctx) => {
  const router = Router();

  const metadataCollection = ctx.collections
    .metadata as unknown as Collection<FileMetadata>;

  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

  const uploadFile = async (
    file: Buffer,
    filename: string
  ): Promise<FileMetadata> => {
    const dateNow = new Date();

    const dateString = dateNow.toISOString().split("T")[0];
    const filePath = path.join(
      dataDir,
      dateString,
      `${dateNow.getTime().toString(16)}.bin`
    );
    if (!existsSync(path.dirname(filePath))) mkdirSync(path.dirname(filePath));

    const fileType = (await fileTypeFromBuffer(file))?.mime;

    const fileMetadata: FileMetadata = {
      id: new ObjectId(),
      type: fileType,
      path: filePath,
      filename,
      uploadedAt: dateNow,
    };

    await writeFile(filePath, file);
    await metadataCollection.insertOne(fileMetadata);
    return fileMetadata;
  };

  const getFileBuffer = async (id: ObjectId): Promise<Buffer | null> => {
    const metadata = await getFileMetadata(id);
    if (!metadata) return null;
    const buffer = await readFile(metadata.path);
    return buffer;
  };

  const getFileMetadata = async (
    id: ObjectId
  ): Promise<FileMetadata | null> => {
    const metadata = await metadataCollection.findOne({ _id: id });
    if (!metadata) return null;
    return metadata;
  };

  const storage = multer.memoryStorage();
  const upload = multer({ storage });

  router.get("/v1/file-data/");

  router.post(
    "/v1/file",
    upload.single("file"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const fileBuffer = req.file?.buffer;
        if (!req.file || !fileBuffer)
          throw createHttpError(400, "Missing `file` file.");

        const metadata = await uploadFile(fileBuffer, req.file.originalname);
        res.status(201).json(mapFileMetadataToFileMetadataView(metadata));
      } catch (err) {
        next(err);
      }
    }
  );

  router.use(
    (err: unknown, req: Request, res: Response, next: NextFunction) => {
      if (isHttpError(err)) {
        res.status(err.status).send(err.message);
      } else if (err instanceof MulterError) {
        res.status(400).send(err.code);
      } else {
        ctx.logger.error(err);
        res.status(500).send("Internal server error occured.");
      }
    }
  );

  return { router, methods: { uploadFile, getFileBuffer }, contexts: {} };
};

export default moduleInitializer;
