import mongoose, { Schema } from "mongoose";

const problemLogSchema = new Schema(
  {
    category: { type: String, default: "General" },
    priority: { type: String, enum: ["Low", "Medium", "High"], default: "Medium" },
    description: { type: String, default: "" },
    photos: [{ type: String }],
    status: { type: String, enum: ["Open", "In Progress", "Waiting", "Resolved"], default: "Open" },
    store: { type: Schema.Types.ObjectId, ref: "Store", default: null, index: true },
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
    ownerName: { type: String, required: true },
    comments: [
      {
        author: { type: Schema.Types.ObjectId, ref: "User" },
        authorName: String,
        message: String,
        status: String,
        createdAt: { type: Date, default: Date.now }
      }
    ],
    history: [
      {
        action: String,
        status: String,
        user: { type: Schema.Types.ObjectId, ref: "User" },
        createdAt: { type: Date, default: Date.now }
      }
    ]
  },
  { timestamps: true }
);

export const ProblemLog = mongoose.model("ProblemLog", problemLogSchema);
