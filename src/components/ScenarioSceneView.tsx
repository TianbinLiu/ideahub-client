/**
 * @file ScenarioSceneView.tsx - 「场景预览」按 sceneKind 分派的只读渲染器。
 * @category Component
 *
 * comment → PlatformCommentView（评论区壳）；chat → PlatformChatView（聊天壳）。
 * 只服务【只读预览】场景（编辑器右栏 / 详情页）——不透传 composer/回调；
 * play 页需要各壳不同的发言语义（评论=回复树、聊天=线性发消息），自己直接用对应壳。
 *
 * 新增 sceneKind 时同步：server/src/models/Scenario.js 的 SCENARIO_SCENE_KINDS + 这里的分派。
 */
import type { ScenarioChatMessage, ScenarioComment, ScenarioParticipant } from "../api";
import PlatformCommentView from "./PlatformCommentView";
import PlatformChatView from "./PlatformChatView";

type ScenarioSceneViewProps = {
  sceneKind?: string;
  platform: string;
  /** comment 场景 */
  comments?: ScenarioComment[];
  topic?: string;
  /** chat 场景 */
  participants?: ScenarioParticipant[];
  messages?: ScenarioChatMessage[];
};

export default function ScenarioSceneView({
  sceneKind,
  platform,
  comments = [],
  topic,
  participants = [],
  messages = [],
}: ScenarioSceneViewProps) {
  if (sceneKind === "chat") {
    return <PlatformChatView platform={platform} participants={participants} messages={messages} />;
  }
  return <PlatformCommentView platform={platform} comments={comments} topic={topic} />;
}
