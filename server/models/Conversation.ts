import mongoose, { Schema } from "mongoose";

const conversationSchema = new Schema(
  {
    name: { type: String, default: "" },
    store: { type: Schema.Types.ObjectId, ref: "Store", default: null, index: true },
    members: [{ type: Schema.Types.ObjectId, ref: "User", required: true }],
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    hiddenFor: [{ type: Schema.Types.ObjectId, ref: "User" }]
  },
  { timestamps: true }
);

export const Conversation = mongoose.model("Conversation", conversationSchema);
