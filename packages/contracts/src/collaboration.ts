export type CommentTargetType = "expense" | "settlement" | "need" | "purchase_request";

export type CreateCommentRequest = {
  workspaceId: string;
  targetType: CommentTargetType;
  targetId: string;
  body: string;
};

export type CommentSummary = {
  id: string;
  workspaceId: string;
  targetType: CommentTargetType;
  targetId: string;
  authorUserId: string;
  body: string;
  createdAt: string;
};

export type AttachmentKind = "receipt" | "document" | "photo";

export type CreateAttachmentRequest = {
  workspaceId: string;
  targetType: CommentTargetType;
  targetId: string;
  kind: AttachmentKind;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** SHA-256 hex of file bytes (client-computed). */
  contentHash: string;
  idempotencyKey: string;
};

export type AttachmentSummary = {
  id: string;
  workspaceId: string;
  targetType: CommentTargetType;
  targetId: string;
  kind: AttachmentKind;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  contentHash: string;
  uploadedByUserId: string;
  createdAt: string;
  /** OCR job id when queued. */
  ocrJobId?: string;
  /** File quarantine status after stub AV scan. */
  quarantineStatus?: "pending" | "scanning" | "clean" | "blocked" | "error";
  /** True when binary content is stored (local blob dir). */
  hasBlob?: boolean;
};

export type UploadAttachmentContentRequest = {
  /** Base64-encoded file bytes (must match registered contentHash). */
  contentBase64: string;
};

export type NotificationChannel = "in_app" | "email" | "push";

export type NotificationSummary = {
  id: string;
  workspaceId: string;
  userId: string;
  channel: NotificationChannel;
  title: string;
  body: string;
  readAt?: string;
  createdAt: string;
  metadata?: Record<string, string>;
};

export type CreateNotificationInput = {
  workspaceId: string;
  userId: string;
  channel: NotificationChannel;
  title: string;
  body: string;
  metadata?: Record<string, string>;
};
