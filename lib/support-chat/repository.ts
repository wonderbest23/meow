import { getServerSupabase } from "../persistence";

export type SupportConversationStatus = "open" | "closed";
export type SupportMessageSender = "customer" | "admin";

export type SupportConversation = {
  id: string;
  status: SupportConversationStatus;
  lastMessagePreview: string;
  unreadByAdmin: number;
  unreadByCustomer: number;
  createdAt: string;
  updatedAt: string;
};

export type SupportMessage = {
  id: string;
  conversationId: string;
  sender: SupportMessageSender;
  body: string;
  createdAt: string;
};

export type SupportChat = {
  conversation: SupportConversation | null;
  messages: SupportMessage[];
};

type StoredConversation = SupportConversation & { guestTokenHash: string };

declare global {
  var __ventureSupportConversations: Map<string, StoredConversation> | undefined;
  var __ventureSupportMessages: Map<string, SupportMessage[]> | undefined;
}

const demoConversations = globalThis.__ventureSupportConversations
  ?? (globalThis.__ventureSupportConversations = new Map());
const demoMessages = globalThis.__ventureSupportMessages
  ?? (globalThis.__ventureSupportMessages = new Map());

let supportTablesAvailable: boolean | undefined;

async function supportSupabase() {
  const supabase = getServerSupabase();
  if (!supabase) return null;
  if (supportTablesAvailable === false) return null;
  if (supportTablesAvailable === true) return supabase;

  const { error } = await supabase
    .from("support_conversations")
    .select("id")
    .limit(1);
  if (!error) {
    supportTablesAvailable = true;
    return supabase;
  }
  const missingTable = error.code === "PGRST205" || error.code === "42P01";
  if (missingTable && process.env.NODE_ENV !== "production") {
    supportTablesAvailable = false;
    return null;
  }
  throw error;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function publicConversation(conversation: StoredConversation): SupportConversation {
  const { guestTokenHash: _guestTokenHash, ...result } = conversation;
  return result;
}

function mapConversation(row: Record<string, unknown>): SupportConversation {
  return {
    id: row.id as string,
    status: row.status as SupportConversationStatus,
    lastMessagePreview: (row.last_message_preview as string) ?? "",
    unreadByAdmin: (row.unread_by_admin as number) ?? 0,
    unreadByCustomer: (row.unread_by_customer as number) ?? 0,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapMessage(row: Record<string, unknown>): SupportMessage {
  return {
    id: row.id as string,
    conversationId: row.conversation_id as string,
    sender: row.sender as SupportMessageSender,
    body: row.body as string,
    createdAt: row.created_at as string,
  };
}

async function loadSupabaseMessages(conversationId: string) {
  const supabase = await supportSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("support_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => mapMessage(row));
}

export async function getCustomerChat(guestTokenHash: string, markRead = true): Promise<SupportChat> {
  const supabase = await supportSupabase();
  if (!supabase) {
    const stored = [...demoConversations.values()].find((item) => item.guestTokenHash === guestTokenHash);
    if (!stored) return { conversation: null, messages: [] };
    if (markRead) stored.unreadByCustomer = 0;
    return {
      conversation: clone(publicConversation(stored)),
      messages: clone(demoMessages.get(stored.id) ?? []),
    };
  }

  const { data, error } = await supabase
    .from("support_conversations")
    .select("*")
    .eq("guest_token_hash", guestTokenHash)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { conversation: null, messages: [] };
  if (markRead && data.unread_by_customer > 0) {
    const { error: updateError } = await supabase
      .from("support_conversations")
      .update({ unread_by_customer: 0 })
      .eq("id", data.id);
    if (updateError) throw updateError;
    data.unread_by_customer = 0;
  }
  return {
    conversation: mapConversation(data),
    messages: await loadSupabaseMessages(data.id),
  };
}

export async function sendCustomerMessage(guestTokenHash: string, body: string): Promise<SupportChat> {
  const supabase = await supportSupabase();
  const now = new Date().toISOString();
  const preview = body.slice(0, 80);

  if (!supabase) {
    let stored = [...demoConversations.values()].find((item) => item.guestTokenHash === guestTokenHash);
    if (!stored) {
      stored = {
        id: crypto.randomUUID(),
        guestTokenHash,
        status: "open",
        lastMessagePreview: "",
        unreadByAdmin: 0,
        unreadByCustomer: 0,
        createdAt: now,
        updatedAt: now,
      };
      demoConversations.set(stored.id, stored);
      demoMessages.set(stored.id, []);
    }
    const message: SupportMessage = {
      id: crypto.randomUUID(),
      conversationId: stored.id,
      sender: "customer",
      body,
      createdAt: now,
    };
    demoMessages.get(stored.id)!.push(message);
    stored.status = "open";
    stored.lastMessagePreview = preview;
    stored.unreadByAdmin += 1;
    stored.updatedAt = now;
    return {
      conversation: clone(publicConversation(stored)),
      messages: clone(demoMessages.get(stored.id)!),
    };
  }

  const { data: existing, error: findError } = await supabase
    .from("support_conversations")
    .select("*")
    .eq("guest_token_hash", guestTokenHash)
    .maybeSingle();
  if (findError) throw findError;

  let conversation = existing;
  if (!conversation) {
    const { data, error } = await supabase
      .from("support_conversations")
      .insert({ guest_token_hash: guestTokenHash })
      .select("*")
      .single();
    if (error) throw error;
    conversation = data;
  }

  const { error: messageError } = await supabase.from("support_messages").insert({
    conversation_id: conversation.id,
    sender: "customer",
    body,
  });
  if (messageError) throw messageError;

  const { data: updated, error: updateError } = await supabase
    .from("support_conversations")
    .update({
      status: "open",
      last_message_preview: preview,
      unread_by_admin: conversation.unread_by_admin + 1,
      updated_at: now,
    })
    .eq("id", conversation.id)
    .select("*")
    .single();
  if (updateError) throw updateError;
  return {
    conversation: mapConversation(updated),
    messages: await loadSupabaseMessages(conversation.id),
  };
}

export async function listAdminConversations(): Promise<SupportConversation[]> {
  const supabase = await supportSupabase();
  if (!supabase) {
    return [...demoConversations.values()]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((item) => clone(publicConversation(item)));
  }
  const { data, error } = await supabase
    .from("support_conversations")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => mapConversation(row));
}

export async function getAdminChat(conversationId: string): Promise<SupportChat> {
  const supabase = await supportSupabase();
  if (!supabase) {
    const stored = demoConversations.get(conversationId);
    if (!stored) return { conversation: null, messages: [] };
    stored.unreadByAdmin = 0;
    return {
      conversation: clone(publicConversation(stored)),
      messages: clone(demoMessages.get(stored.id) ?? []),
    };
  }
  const { data, error } = await supabase
    .from("support_conversations")
    .update({ unread_by_admin: 0 })
    .eq("id", conversationId)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) return { conversation: null, messages: [] };
  return {
    conversation: mapConversation(data),
    messages: await loadSupabaseMessages(conversationId),
  };
}

export async function sendAdminMessage(conversationId: string, body: string): Promise<SupportChat> {
  const supabase = await supportSupabase();
  const now = new Date().toISOString();
  const preview = body.slice(0, 80);

  if (!supabase) {
    const stored = demoConversations.get(conversationId);
    if (!stored) throw new Error("SUPPORT_CONVERSATION_NOT_FOUND");
    const message: SupportMessage = {
      id: crypto.randomUUID(),
      conversationId,
      sender: "admin",
      body,
      createdAt: now,
    };
    demoMessages.get(conversationId)!.push(message);
    stored.lastMessagePreview = preview;
    stored.unreadByCustomer += 1;
    stored.updatedAt = now;
    return {
      conversation: clone(publicConversation(stored)),
      messages: clone(demoMessages.get(conversationId)!),
    };
  }

  const { data: conversation, error: findError } = await supabase
    .from("support_conversations")
    .select("*")
    .eq("id", conversationId)
    .maybeSingle();
  if (findError) throw findError;
  if (!conversation) throw new Error("SUPPORT_CONVERSATION_NOT_FOUND");
  const { error: messageError } = await supabase.from("support_messages").insert({
    conversation_id: conversationId,
    sender: "admin",
    body,
  });
  if (messageError) throw messageError;
  const { data: updated, error: updateError } = await supabase
    .from("support_conversations")
    .update({
      last_message_preview: preview,
      unread_by_customer: conversation.unread_by_customer + 1,
      updated_at: now,
    })
    .eq("id", conversationId)
    .select("*")
    .single();
  if (updateError) throw updateError;
  return {
    conversation: mapConversation(updated),
    messages: await loadSupabaseMessages(conversationId),
  };
}

export async function setConversationStatus(
  conversationId: string,
  status: SupportConversationStatus,
): Promise<SupportConversation> {
  const supabase = await supportSupabase();
  const updatedAt = new Date().toISOString();
  if (!supabase) {
    const stored = demoConversations.get(conversationId);
    if (!stored) throw new Error("SUPPORT_CONVERSATION_NOT_FOUND");
    stored.status = status;
    stored.updatedAt = updatedAt;
    return clone(publicConversation(stored));
  }
  const { data, error } = await supabase
    .from("support_conversations")
    .update({ status, updated_at: updatedAt })
    .eq("id", conversationId)
    .select("*")
    .single();
  if (error) throw error;
  return mapConversation(data);
}
