import mongoose, { Schema } from "mongoose";

const messageSchema = new Schema(
  {
    conversation: { type: Schema.Types.ObjectId, ref: "Conversation" },
    store: { type: Schema.Types.ObjectId, ref: "Store", default: null, index: true },
    from: { type: Schema.Types.ObjectId, ref: "User", required: true },
    fromName: { type: String, required: true },
    fromProfilePicture: { type: String, default: "" },
    recipients: [{ type: Schema.Types.ObjectId, ref: "User" }],
    subject: { type: String, default: "" },
    body: { type: String, default: "" },
    attachments: [
      {
        name: { type: String, required: true },
        type: { type: String, default: "application/octet-stream" },
        url: { type: String, required: true }
      }
    ],
    readBy: [{ type: Schema.Types.ObjectId, ref: "User" }],
    reactions: [
      {
        emoji: { type: String, required: true },
        users: [{ type: Schema.Types.ObjectId, ref: "User" }]
      }
    ]
  },
  { timestamps: true }
);

export const Message = mongoose.model("Message", messageSchema);
