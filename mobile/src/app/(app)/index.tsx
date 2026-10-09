import { useLocalSearchParams } from 'expo-router';
import { ChatScreen } from '@/components/chat/ChatScreen';
import { useConversations } from '@/lib/conversations';

export default function NewChatScreen() {
  // The drawer keeps this screen mounted; a new key gives each new chat a blank slate. "Ask Mitra to change something"
  // on the Review screen opens it with the record named in the message box (`ask`), for the person to finish.
  const { newChatKey } = useConversations();
  const { ask } = useLocalSearchParams<{ ask?: string }>();
  return <ChatScreen key={`${newChatKey}|${ask ?? ''}`} initialDraft={ask} />;
}
