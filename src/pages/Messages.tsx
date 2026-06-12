import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Download, File, Image, MoreVertical, Paperclip, Plus, Search, Send, SmilePlus, Trash2, UserMinus, Users, X } from "lucide-react";
import { Card } from "../components/Card";
import { apiFetch, getSession, type SessionUser } from "../lib/api";
import { cn } from "../lib/utils";

type Attachment = {
  _id?: string;
  name: string;
  type: string;
  url: string;
};

type Reaction = {
  _id?: string;
  emoji: string;
  users: string[];
};

type ChatMessage = {
  _id: string;
  from: string;
  fromName: string;
  fromProfilePicture?: string;
  body: string;
  attachments: Attachment[];
  readBy: string[];
  reactions: Reaction[];
  createdAt: string;
};

type Conversation = {
  _id: string;
  name: string;
  members: Array<SessionUser & { _id?: string }>;
  updatedAt: string;
};

const emojis = ["👍", "❤️", "😂", "🎉", "✅", "👀"];

function normalizeMessage(message: ChatMessage): ChatMessage {
  return {
    ...message,
    attachments: Array.isArray(message.attachments) ? message.attachments : [],
    readBy: Array.isArray(message.readBy) ? message.readBy : [],
    reactions: Array.isArray(message.reactions) ? message.reactions : []
  };
}

function normalizeConversation(conversation: Conversation): Conversation {
  return {
    ...conversation,
    members: conversation.members
      .map((member) => ({ ...member, id: member.id || member._id || "" }))
      .filter((member) => member.id)
  };
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function Avatar({ user, size = "h-10 w-10" }: { user: Pick<SessionUser, "name" | "profilePicture">; size?: string }) {
  if (user.profilePicture) {
    return <img className={cn(size, "shrink-0 rounded-full border object-cover shadow-sm")} src={user.profilePicture} alt="" />;
  }
  return (
    <div className={cn(size, "flex shrink-0 items-center justify-center rounded-full border bg-primary text-xs font-semibold text-primaryForeground shadow-sm")}>
      {user.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()}
    </div>
  );
}

function memberLabel(user: SessionUser) {
  return `${user.name}${user.role ? ` · ${user.role}` : ""}${user.storeName ? ` · ${user.storeName}` : ""}`;
}

function memberDetail(user: SessionUser) {
  const login = user.role === "Administrator" || user.role === "Manager" ? `@${user.username || "login-id"}` : user.role;
  return [login, user.storeName].filter(Boolean).join(" · ") || user.department || "Staff";
}

export function Messages() {
  const session = getSession();
  const currentUserId = session?.user.id ?? "";
  const isOwner = session?.user.role === "Owner";
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [directory, setDirectory] = useState<SessionUser[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [notice, setNotice] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [reactionPickerId, setReactionPickerId] = useState("");
  const [conversationSearch, setConversationSearch] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [newMembers, setNewMembers] = useState<string[]>([]);
  const [editedName, setEditedName] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const chatScroll = useRef<HTMLDivElement>(null);
  const selectedIdRef = useRef("");
  const shouldScrollAfterLoad = useRef(true);
  const active = conversations.find((conversation) => conversation._id === selectedId);

  useEffect(() => {
    void loadDirectory();
    void loadConversations();
    const interval = window.setInterval(() => void loadConversations(), 4000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    selectedIdRef.current = selectedId;
    if (!selectedId) {
      setMessages([]);
      return;
    }
    shouldScrollAfterLoad.current = true;
    void loadMessages(selectedId);
    const interval = window.setInterval(() => void loadMessages(selectedId), 3000);
    return () => window.clearInterval(interval);
  }, [selectedId]);

  useEffect(() => {
    setEditedName(active?.name ?? "");
    setReactionPickerId("");
  }, [active?._id, active?.name]);

  async function loadDirectory() {
    try {
      const data = await apiFetch<SessionUser[]>("/users/directory");
      setDirectory(data);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not load coworkers.");
    }
  }

  async function loadConversations() {
    try {
      const data = (await apiFetch<Conversation[]>("/messages/conversations")).map(normalizeConversation);
      setConversations(data);
      setSelectedId((current) => data.some((conversation) => conversation._id === current) ? current : data[0]?._id ?? "");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not load conversations.");
    }
  }

  async function loadMessages(conversationId: string) {
    try {
      const data = (await apiFetch<ChatMessage[]>(`/messages/conversations/${conversationId}/messages`)).map(normalizeMessage);
      if (selectedIdRef.current !== conversationId) return;

      const keepAtBottom = shouldScrollAfterLoad.current || isNearChatBottom();
      setMessages((current) => {
        if (JSON.stringify(current) === JSON.stringify(data)) return current;
        window.requestAnimationFrame(() => {
          if (keepAtBottom) scrollChatToBottom("auto");
        });
        return data;
      });
      shouldScrollAfterLoad.current = false;

      const unread = data.filter((message) => !message.readBy.includes(currentUserId));
      await Promise.all(unread.map((message) => apiFetch(`/messages/${message._id}/read`, { method: "PATCH" }).catch(() => null)));
    } catch (error) {
      if (selectedIdRef.current === conversationId) {
        setNotice(error instanceof Error ? error.message : "Could not load messages.");
      }
    }
  }

  function isNearChatBottom() {
    const panel = chatScroll.current;
    return !panel || panel.scrollHeight - panel.scrollTop - panel.clientHeight < 96;
  }

  function scrollChatToBottom(behavior: ScrollBehavior) {
    const panel = chatScroll.current;
    if (panel) panel.scrollTo({ top: panel.scrollHeight, behavior });
  }

  function selectConversation(id: string) {
    shouldScrollAfterLoad.current = true;
    setSelectedId(id);
    setReactionPickerId("");
  }

  function toggleMember(id: string, list: string[], setList: (members: string[]) => void) {
    setList(list.includes(id) ? list.filter((memberId) => memberId !== id) : [...list, id]);
  }

  async function createConversation() {
    if (newMembers.length === 0) {
      setNotice("Select at least one coworker.");
      return;
    }
    try {
      const created = normalizeConversation(await apiFetch<Conversation>("/messages/conversations", {
        method: "POST",
        body: JSON.stringify({ name: newName, members: newMembers })
      }));
      setConversations((current) => [created, ...current]);
      selectConversation(created._id);
      setNewName("");
      setNewMembers([]);
      setShowNew(false);
      setNotice("");
    } catch (error) {
      setNotice(getErrorMessage(error, "Could not create conversation."));
    }
  }

  async function updateConversation(update: { name?: string; members?: string[] }) {
    if (!active) return;
    try {
      const updated = normalizeConversation(await apiFetch<Conversation>(`/messages/conversations/${active._id}`, {
        method: "PATCH",
        body: JSON.stringify(update)
      }));
      setConversations((current) => current.map((conversation) => conversation._id === updated._id ? updated : conversation));
      setEditedName(updated.name);
      setNotice("");
    } catch (error) {
      setNotice(getErrorMessage(error, "Could not update conversation."));
    }
  }

  async function renameConversation() {
    if (!active || !editedName.trim() || editedName.trim() === active.name) return;
    await updateConversation({ name: editedName.trim() });
  }

  async function changeConversationMember(memberId: string) {
    if (!active) return;
    const selected = active.members.map((member) => member.id);
    const members = selected.includes(memberId)
      ? selected.filter((id) => id !== memberId)
      : [...selected, memberId];
    await updateConversation({ members });
  }

  async function removeConversation() {
    if (!active || !window.confirm(`Remove "${active.name}" from your conversations?`)) return;
    try {
      await apiFetch(`/messages/conversations/${active._id}`, { method: "DELETE" });
      const remaining = conversations.filter((conversation) => conversation._id !== active._id);
      setConversations(remaining);
      selectConversation(remaining[0]?._id ?? "");
      setMessages([]);
      setNotice("");
    } catch (error) {
      setNotice(getErrorMessage(error, "Could not remove conversation."));
    }
  }

  async function addFiles(event: ChangeEvent<HTMLInputElement>) {
    try {
      const files = Array.from(event.target.files ?? []);
      const encoded = await Promise.all(files.map((file) => new Promise<Attachment>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ name: file.name, type: file.type || "application/octet-stream", url: String(reader.result) });
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      })));
      setAttachments((current) => [...current, ...encoded]);
      setNotice("");
    } catch (error) {
      setNotice(getErrorMessage(error, "Could not attach files."));
    } finally {
      event.target.value = "";
    }
  }

  async function sendMessage() {
    if (!active || (!body.trim() && attachments.length === 0)) return;
    try {
      const created = normalizeMessage(await apiFetch<ChatMessage>(`/messages/conversations/${active._id}/messages`, {
        method: "POST",
        body: JSON.stringify({ body, attachments })
      }));
      setMessages((current) => [...current, created]);
      window.requestAnimationFrame(() => scrollChatToBottom("smooth"));
      setBody("");
      setAttachments([]);
      setShowEmoji(false);
      setNotice("");
      void loadConversations();
    } catch (error) {
      setNotice(getErrorMessage(error, "Could not send message."));
    }
  }

  async function react(messageId: string, emoji: string) {
    try {
      const updated = normalizeMessage(await apiFetch<ChatMessage>(`/messages/${messageId}/reactions`, {
        method: "PATCH",
        body: JSON.stringify({ emoji })
      }));
      setMessages((current) => current.map((message) => message._id === updated._id ? updated : message));
      setReactionPickerId("");
      setNotice("");
    } catch (error) {
      setNotice(getErrorMessage(error, "Could not add reaction."));
    }
  }

  async function deleteMessage(message: ChatMessage) {
    if (!window.confirm("Delete this message?")) return;
    try {
      await apiFetch(`/messages/${message._id}`, { method: "DELETE" });
      setMessages((current) => current.filter((item) => item._id !== message._id));
      setNotice("");
    } catch (error) {
      setNotice(getErrorMessage(error, "Could not delete message."));
    }
  }

  const availableMembers = useMemo(() => directory
    .filter((user) => user.id !== currentUserId)
    .filter((user) => !isOwner || user.role === "Administrator" || user.role === "Manager"), [currentUserId, directory, isOwner]);
  const filteredConversations = useMemo(() => {
    const query = conversationSearch.trim().toLowerCase();
    return query ? conversations.filter((conversation) => conversation.name.toLowerCase().includes(query)) : conversations;
  }, [conversationSearch, conversations]);
  const filteredMembers = useMemo(() => {
    const query = memberSearch.trim().toLowerCase();
    return query ? availableMembers.filter((member) => [member.name, member.username, member.department].some((value) => value?.toLowerCase().includes(query))) : availableMembers;
  }, [availableMembers, memberSearch]);
  const sharedAttachments = useMemo(() => messages.flatMap((message) => message.attachments), [messages]);

  return (
    <div className={cn("grid min-h-[calc(100vh-8rem)] gap-4", showInfo ? "xl:grid-cols-[290px_minmax(0,1fr)_300px]" : "xl:grid-cols-[310px_minmax(0,1fr)]")}>
      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <h2 className="text-sm font-semibold">Conversations</h2>
            <p className="mt-1 text-xs text-mutedForeground">{conversations.length} active chats</p>
          </div>
          <button className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primaryForeground shadow-soft" aria-label="New conversation" title="New conversation" onClick={() => setShowNew((value) => !value)}>
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <label className="relative block border-b p-3">
          <Search className="pointer-events-none absolute left-6 top-1/2 h-4 w-4 -translate-y-1/2 text-mutedForeground" />
          <input className="h-9 w-full rounded-xl border bg-white/80 pl-9 pr-3 text-sm shadow-sm dark:bg-zinc-900/80" placeholder="Search chats" value={conversationSearch} onChange={(event) => setConversationSearch(event.target.value)} />
        </label>
        {showNew ? (
          <div className="space-y-3 border-b bg-white/45 p-4 dark:bg-zinc-900/35">
            <input className="h-9 w-full rounded-xl border bg-white/80 px-3 text-sm shadow-sm dark:bg-zinc-900/80" placeholder="Conversation name" value={newName} onChange={(event) => setNewName(event.target.value)} />
            <MemberPicker users={availableMembers} selected={newMembers} onToggle={(id) => toggleMember(id, newMembers, setNewMembers)} />
            <button className="flex h-9 w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 text-sm text-primaryForeground shadow-soft" onClick={createConversation}>
              <Users className="h-4 w-4" /> Create chat
            </button>
          </div>
        ) : null}
        <div className="thin-scrollbar max-h-[calc(100vh-13rem)] overflow-y-auto">
          {filteredConversations.map((conversation) => {
            const firstMember = conversation.members.find((member) => member.id !== currentUserId) ?? conversation.members[0];
            return (
              <button key={conversation._id} className={cn("flex w-full items-center gap-3 border-b p-4 text-left transition hover:bg-accent", selectedId === conversation._id && "bg-accent")} onClick={() => selectConversation(conversation._id)}>
                {firstMember ? <Avatar user={firstMember} /> : <div className="h-10 w-10 rounded-full bg-muted" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{conversation.name}</p>
                  <p className="mt-1 truncate text-xs text-mutedForeground">{conversation.members.length} members</p>
                </div>
              </button>
            );
          })}
          {filteredConversations.length === 0 ? <p className="p-6 text-center text-sm text-mutedForeground">No conversations found.</p> : null}
        </div>
      </Card>

      <Card className="flex min-h-[680px] min-w-0 flex-col overflow-hidden p-0">
        {active ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold">{active.name}</h2>
                  <p className="mt-1 text-xs text-mutedForeground">{active.members.map(memberLabel).join(", ")}</p>
              </div>
              <div className="flex gap-2">
                <button className={cn("flex h-9 w-9 items-center justify-center rounded-xl border bg-white/80 shadow-sm dark:bg-zinc-900/80", showInfo && "bg-primary text-primaryForeground dark:bg-primary")} aria-label="Open conversation information" title="Conversation info" onClick={() => setShowInfo((value) => !value)}><MoreVertical className="h-4 w-4" /></button>
                <button className="flex h-9 w-9 items-center justify-center rounded-xl border border-red-200 bg-white/80 text-red-700 shadow-sm dark:border-red-900 dark:bg-zinc-900/80 dark:text-red-300" aria-label="Remove conversation" title="Remove conversation" onClick={removeConversation}><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
            <div ref={chatScroll} className="thin-scrollbar flex-1 space-y-4 overflow-y-auto bg-white/30 p-4 dark:bg-zinc-900/20">
              {messages.map((message) => {
                const own = message.from === currentUserId;
                return (
                  <div key={message._id} className={cn("flex gap-3", own && "flex-row-reverse")}>
                    <Avatar user={{ name: message.fromName, profilePicture: message.fromProfilePicture }} size="h-9 w-9" />
                    <div className={cn("max-w-[min(82%,680px)]", own && "text-right")}>
                      <div className={cn("rounded-2xl border bg-white/90 px-4 py-3 text-left shadow-sm dark:bg-zinc-900/90", own && "bg-primary text-primaryForeground dark:bg-primary")}>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs font-semibold">{message.fromName}</p>
                          <button className="flex h-6 w-6 items-center justify-center rounded-lg shadow-none opacity-70 hover:opacity-100" aria-label="Delete message" title="Delete message" onClick={() => deleteMessage(message)}><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                        {message.body ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{message.body}</p> : null}
                        {message.attachments.length ? <AttachmentList attachments={message.attachments} /> : null}
                      </div>
                      <div className={cn("mt-1 flex flex-wrap items-center gap-1", own && "justify-end")}>
                        {message.reactions.map((reaction) => (
                          <button key={reaction.emoji} className={cn("rounded-full border bg-white/85 px-2 py-0.5 text-xs shadow-sm dark:bg-zinc-900/85", reaction.users.includes(currentUserId) && "border-zinc-900")} onClick={() => react(message._id, reaction.emoji)}>
                            {reaction.emoji} {reaction.users.length}
                          </button>
                        ))}
                        <div className="relative">
                          <button className="flex h-6 w-6 items-center justify-center rounded-full border bg-white/85 shadow-sm dark:bg-zinc-900/85" aria-label="Add reaction" title="Add reaction" onClick={() => setReactionPickerId((current) => current === message._id ? "" : message._id)}><SmilePlus className="h-3.5 w-3.5" /></button>
                          {reactionPickerId === message._id ? <div className="flex gap-1 rounded-xl border bg-white p-1 shadow-soft dark:bg-zinc-900">
                            {emojis.map((emoji) => <button key={emoji} className="rounded-lg p-1 text-sm shadow-none hover:bg-accent" onClick={() => react(message._id, emoji)}>{emoji}</button>)}
                          </div> : null}
                        </div>
                        <span className="ml-1 text-[11px] text-mutedForeground">{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="border-t p-3">
              {attachments.length ? (
                <div className="mb-3 flex flex-wrap gap-2">
                  {attachments.map((attachment, index) => (
                    <div key={`${attachment.name}-${index}`} className="flex items-center gap-2 rounded-xl border bg-white/80 px-3 py-2 text-xs shadow-sm dark:bg-zinc-900/80">
                      {attachment.type.startsWith("image/") ? <Image className="h-4 w-4" /> : <File className="h-4 w-4" />}
                      <span className="max-w-40 truncate">{attachment.name}</span>
                      <button className="shadow-none" aria-label="Remove attachment" onClick={() => setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="flex items-end gap-2">
                <textarea className="min-h-11 flex-1 resize-none rounded-xl border bg-white/80 px-3 py-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-ring dark:bg-zinc-900/80" placeholder="Write a message" value={body} onChange={(event) => setBody(event.target.value)} onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage();
                  }
                }} />
                <input ref={fileInput} className="hidden" type="file" multiple onChange={addFiles} />
                <button className="flex h-11 w-11 items-center justify-center rounded-xl border bg-white/80 shadow-sm dark:bg-zinc-900/80" aria-label="Attach files" title="Attach files" onClick={() => fileInput.current?.click()}><Paperclip className="h-4 w-4" /></button>
                <div className="relative">
                  <button className="flex h-11 w-11 items-center justify-center rounded-xl border bg-white/80 shadow-sm dark:bg-zinc-900/80" aria-label="Add emoji" title="Add emoji" onClick={() => setShowEmoji((value) => !value)}><SmilePlus className="h-4 w-4" /></button>
                  {showEmoji ? <div className="absolute bottom-14 right-0 z-30 flex gap-1 rounded-xl border bg-white p-2 shadow-soft dark:bg-zinc-900">{emojis.map((emoji) => <button key={emoji} className="rounded-lg p-1 text-base shadow-none hover:bg-accent" onClick={() => setBody((current) => `${current}${emoji}`)}>{emoji}</button>)}</div> : null}
                </div>
                <button className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primaryForeground shadow-soft" aria-label="Send message" title="Send message" onClick={sendMessage}><Send className="h-4 w-4" /></button>
              </div>
              {notice ? <p className="mt-2 text-xs text-red-600">{notice}</p> : null}
            </div>
          </>
        ) : <div className="flex flex-1 items-center justify-center p-8 text-sm text-mutedForeground">Create a conversation to start messaging.</div>}
      </Card>
      {showInfo && active ? (
        <Card className="overflow-hidden p-0">
          <div className="flex items-center justify-between border-b p-4">
            <div>
              <h2 className="text-sm font-semibold">Conversation info</h2>
              <p className="mt-1 text-xs text-mutedForeground">{active.members.length} members</p>
            </div>
            <button className="flex h-8 w-8 items-center justify-center rounded-xl border bg-white/80 shadow-sm dark:bg-zinc-900/80" aria-label="Close conversation information" title="Close" onClick={() => setShowInfo(false)}><X className="h-4 w-4" /></button>
          </div>
          <div className="thin-scrollbar max-h-[calc(100vh-13rem)] space-y-5 overflow-y-auto p-4">
            <label className="block">
              <span className="mb-2 block text-xs font-medium text-mutedForeground">Group name</span>
              <input className="h-10 w-full rounded-xl border bg-white/80 px-3 text-sm shadow-sm dark:bg-zinc-900/80" value={editedName} onChange={(event) => setEditedName(event.target.value)} onBlur={() => void renameConversation()} onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }} />
            </label>
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase text-mutedForeground">Members</h3>
                <span className="text-xs text-mutedForeground">{active.members.length}</span>
              </div>
              <div className="space-y-1">
                {active.members.map((member) => (
                  <div key={member.id} className="flex items-center gap-2 rounded-xl border bg-white/60 p-2 shadow-sm dark:bg-zinc-900/60">
                    <Avatar user={member} size="h-8 w-8" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold">{member.name}</p>
                      <p className="truncate text-[11px] text-mutedForeground">{memberDetail(member)}</p>
                    </div>
                    {member.id !== currentUserId ? <button className="flex h-7 w-7 items-center justify-center rounded-lg border border-red-200 bg-white/80 text-red-700 shadow-sm dark:border-red-900 dark:bg-zinc-900/80 dark:text-red-300" aria-label={`Remove ${member.name}`} title="Remove member" onClick={() => void changeConversationMember(member.id)}><UserMinus className="h-3.5 w-3.5" /></button> : null}
                  </div>
                ))}
              </div>
            </section>
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase text-mutedForeground">Add people</h3>
              <label className="relative mb-2 block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-mutedForeground" />
                <input className="h-9 w-full rounded-xl border bg-white/80 pl-8 pr-3 text-xs shadow-sm dark:bg-zinc-900/80" placeholder="Search coworkers" value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} />
              </label>
              <div className="space-y-1">
                {filteredMembers.filter((member) => !active.members.some((activeMember) => activeMember.id === member.id)).map((member) => (
                  <button key={member.id} className="flex w-full items-center gap-2 rounded-xl border bg-white/60 p-2 text-left shadow-sm dark:bg-zinc-900/60" onClick={() => void changeConversationMember(member.id)}>
                    <Avatar user={member} size="h-8 w-8" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold">{member.name}</p>
                      <p className="truncate text-[11px] text-mutedForeground">{memberDetail(member)}</p>
                    </div>
                    <Plus className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </section>
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase text-mutedForeground">Shared files</h3>
              {sharedAttachments.length ? <AttachmentList attachments={sharedAttachments} /> : <p className="text-xs text-mutedForeground">No files shared yet.</p>}
            </section>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function MemberPicker({ users, selected, onToggle }: { users: SessionUser[]; selected: string[]; onToggle: (id: string) => void }) {
  return (
    <div className="thin-scrollbar max-h-36 space-y-1 overflow-y-auto rounded-xl border bg-white/70 p-2 dark:bg-zinc-900/70">
      {users.map((user) => (
        <label key={user.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-accent">
          <input className="h-4 w-4" type="checkbox" checked={selected.includes(user.id)} onChange={() => onToggle(user.id)} />
          <Avatar user={user} size="h-6 w-6" />
          <span className="min-w-0">
            <span className="block truncate">{user.name}</span>
            <span className="block truncate text-[11px] text-mutedForeground">{memberDetail(user)}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

function AttachmentList({ attachments }: { attachments: Attachment[] }) {
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      {attachments.map((attachment, index) => attachment.type.startsWith("image/") ? (
        <a key={`${attachment.name}-${index}`} className="overflow-hidden rounded-xl border bg-white/10 shadow-sm" href={attachment.url} download={attachment.name}>
          <img className="max-h-64 w-full object-cover" src={attachment.url} alt={attachment.name} />
          <span className="block truncate px-2 py-1 text-xs">{attachment.name}</span>
        </a>
      ) : (
        <a key={`${attachment.name}-${index}`} className="flex items-center gap-2 rounded-xl border bg-white/10 px-3 py-2 text-xs shadow-sm" href={attachment.url} download={attachment.name}>
          <Download className="h-4 w-4" />
          <span className="truncate">{attachment.name}</span>
        </a>
      ))}
    </div>
  );
}
