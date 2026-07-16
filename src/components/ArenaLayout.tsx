/**
 * @file ArenaLayout.tsx - /arena/* 的 layout route（需求 7 + 8c）
 * @category Component
 * @i18n none（自身无文案）
 *
 * 📖 [AI] 修改前必读: /.ai-instructions.md #新建组件必备功能清单
 * 🔄 [AI] 修改后必须: 同步更新 PROJECT_STRUCTURE.md 组件列表
 *
 * 职责:
 * - 给 /arena 及其所有子路由套上：ArenaNavbar（广场专属导航栏） + ArenaGate（插件门禁）
 *
 * 为什么是 layout route 而不是每页各塞一遍:
 * - 挂一次就覆盖整片 /arena/*，新增子路由自动被守住，不会有人漏塞导致门禁出洞；
 * - 导航栏不随子路由切换而重挂载（铃铛未读数不会每次跳页重新拉）。
 *
 * 导航栏在门禁【外面】：没装插件的用户被拦住时仍要能点 home 回主站，
 * 否则就是把人关在一个只有一个弹窗的死页面里。
 *
 * 依赖文件:
 * @uses ./ArenaNavbar.tsx
 * @uses ./ArenaGate.tsx
 *
 * 被使用于:
 * @used_in ../App.tsx - <Route element={<ArenaLayout />}> 包住全部 /arena/* 路由
 */

import { Outlet } from "react-router-dom";
import ArenaNavbar from "./ArenaNavbar";
import ArenaGate from "./ArenaGate";

export default function ArenaLayout() {
  return (
    <>
      <ArenaNavbar />
      <ArenaGate>
        <Outlet />
      </ArenaGate>
    </>
  );
}
