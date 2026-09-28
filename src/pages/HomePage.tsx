import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { COMMANDS, type CommandId } from "@/shared/commands";
import { KNOWN_DESTINATIONS } from "@/shared/known-destinations";

import { useShortcutLabel } from "../actions/workspace-actions";
import DemoPanel from "../components/dashboard/DemoPanel";
import TaskPanel from "../components/dashboard/TaskPanel";
import SettingsControls from "../components/layout/SettingsControls";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../components/ui/dialog";
import { SelectMenu } from "../components/ui/select-menu";
import { Hint } from "../components/ui/tooltip";
import { useCommands } from "../context/CommandsContext";
import { useTasks, useDesktop } from "../context/DesktopContext";
import { useScratchpad } from "../context/ScratchpadContext";
import { useAsyncAction } from "../hooks/useAsyncAction";

export default function HomePage() {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const tasks = useTasks();
  const { appInfo } = useDesktop();
  const {
    draft,
    dirty,
    setDraft,
    saveDraft,
    importText,
    exportText,
    title,
    setTitle,
    documents,
    document,
    selectDocument,
    deleteDocument,
    busy,
    conflict,
    reloadSaved,
    saveAsNew,
    discardDraft,
    loadMore,
    hasMore,
  } = useScratchpad();
  const command = useCommands();
  const shortcutLabel = useShortcutLabel();
  const { runAction, isRunning: pending, error } = useAsyncAction();
  const run = async (action: () => Promise<unknown>): Promise<void> => {
    await runAction(
      "dashboard",
      async () => {
        try {
          return await action();
        } catch (caught) {
          throw caught instanceof Error ? caught : new Error("Unable to complete this action.");
        }
      },
      {
        onError: (failure) => {
          toast.error(failure.message);
        },
      },
    );
  };
  const commandButton = (id: CommandId): ReactNode => (
    <Hint
      key={id}
      label={COMMANDS[id].label}
      shortcut={shortcutLabel(id, window.desktop.window.platform === "darwin")}
      side="top"
    >
      <Button size="sm" variant="outline" onClick={() => command(id)}>
        {COMMANDS[id].label}
      </Button>
    </Hint>
  );
  return (
    <div className="demo-dashboard">
      <header className="demo-heading">
        <div>
          <p className="demo-eyebrow">
            {appInfo?.name ?? "Electron app"} · {appInfo?.version}
          </p>
          <h1>Everything, in one workspace.</h1>
          <p>Try the app’s built-in tools. These controls use real files, preferences, and device permissions.</p>
        </div>
        <Button variant="outline" onClick={() => command("commandPalette")}>
          Search commands…
        </Button>
      </header>
      {error ? (
        <p role="alert" className="demo-error">
          {error.message}
        </p>
      ) : null}
      <div className="demo-grid">
        <DemoPanel title="Saved documents" description="Write a note, import text, or export a file.">
          <div className="demo-actions">
            <SelectMenu
              data-id="saved-documents-select"
              label="Saved documents"
              value={document?.id ?? ""}
              disabled={busy}
              onValueChange={(value) => void selectDocument(value || null)}
              options={[
                { value: "", label: "New document" },
                ...(document && !documents.some((item) => item.id === document.id)
                  ? [{ value: document.id, label: document.title }]
                  : []),
                ...documents.map((item) => ({ value: item.id, label: item.title })),
              ]}
            />
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void selectDocument(null)}>
              New
            </Button>
            <Button size="sm" variant="outline" disabled={busy || !document} onClick={() => setDeleteOpen(true)}>
              Delete
            </Button>
          </div>
          {hasMore && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void loadMore()}>
              Load more documents
            </Button>
          )}
          <div className="demo-document-editor">
            <div className="demo-document-title-field">
              <label className="demo-note" htmlFor="document-title">
                Document title
              </label>
              <input
                id="document-title"
                className="demo-document-title w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                aria-label="Document title"
                maxLength={255}
                value={title}
                disabled={busy}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <textarea
              disabled={busy}
              className="demo-scratchpad"
              value={draft}
              maxLength={10_000}
              rows={6}
              aria-label="Scratchpad draft"
              aria-describedby="draft-storage-hint"
              placeholder="Write a document"
              onChange={(event) => setDraft(event.target.value)}
            />
          </div>
          {conflict && (
            <div role="alert">
              This document changed or was deleted in another window. Your edits are kept.
              <Button disabled={busy} onClick={() => void reloadSaved()}>
                Reload saved version
              </Button>
              <Button disabled={busy} onClick={() => void saveAsNew()}>
                Save as a new document
              </Button>
            </div>
          )}
          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete saved document?</DialogTitle>
                <DialogDescription>
                  This removes the saved document from all windows. Unsaved edits in this window will also be discarded.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    void deleteDocument().then(() => setDeleteOpen(false));
                  }}
                >
                  Delete document
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <div className="demo-actions">
            <Button
              size="sm"
              disabled={busy || (!dirty && Boolean(document))}
              onClick={() => {
                void saveDraft();
              }}
            >
              Save document
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void importText()}>
              Import text…
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void exportText()}>
              Export text…
            </Button>
          </div>
          {dirty && (
            <Button variant="outline" size="sm" disabled={busy} onClick={discardDraft}>
              Discard edits
            </Button>
          )}
          <p className="demo-note" role="status">
            {dirty ? "Unsaved changes" : draft ? "Saved to this device" : "New document"}
          </p>
          <p id="draft-storage-hint" className="demo-note">
            Save keeps this document on this device across restarts. Export writes a separate file.
          </p>
        </DemoPanel>
        <DemoPanel title="Appearance & workspace" description="Changes apply immediately and preferences persist.">
          <SettingsControls section="appearance" embedded />
          <div className="demo-actions">
            {(["toggleSidebar", "toggleDetails", "shortcuts"] as const).map(commandButton)}
          </div>
        </DemoPanel>
        <TaskPanel tasks={tasks} pending={pending} run={run} />
        <DemoPanel title="Permissions" description="Application consent and system access are separate.">
          <SettingsControls section="permissions" embedded />
        </DemoPanel>
        <DemoPanel
          title="Sharing & app information"
          description="Preview your draft and completed hashes before copying a summary."
        >
          <div className="demo-actions">
            {commandButton("share")}
            {commandButton("about")}
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                void run(async () => {
                  await window.desktop.sharing.copyWorkspaceSummary({ draft });
                  toast.success("Workspace summary copied");
                })
              }
            >
              Copy workspace summary
            </Button>
          </div>
          <h3 className="demo-subheading">Project links</h3>
          <div className="demo-actions">
            {KNOWN_DESTINATIONS.map((id) => (
              <Button
                key={id}
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => void run(() => window.desktop.links.openKnownDestination(id))}
              >
                {id[0].toUpperCase() + id.slice(1)}
              </Button>
            ))}
          </div>
          <p className="demo-note">Links open configured HTTPS destinations in your browser.</p>
        </DemoPanel>
        <DemoPanel title="Software updates" description="Check for a release and follow its download status.">
          <SettingsControls section="updates" embedded />
          <p className="demo-note">Updates require a packaged application with a configured release feed.</p>
        </DemoPanel>
        <DemoPanel
          title="Diagnostics & recovery"
          description="Inspect the running application and manage its local preferences."
        >
          <SettingsControls section="advanced" embedded />
        </DemoPanel>
        <DemoPanel
          title="Native integration"
          description="Window controls, native menus, file dialogs, and deep links."
          wide
        >
          <div className="demo-actions">
            <Button size="sm" variant="outline" onClick={() => void run(() => window.desktop.window.minimize())}>
              Minimize window
            </Button>
            <Button size="sm" variant="outline" onClick={() => void run(() => window.desktop.window.toggleMaximize())}>
              Toggle maximize
            </Button>
            <Button size="sm" variant="outline" onClick={() => void run(() => window.desktop.window.close())}>
              Close window
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void run(() => window.desktop.window.quit())}>
              Quit app
            </Button>
            {commandButton("settings")}
          </div>
          <p className="demo-note">
            Quit and recovery actions protect unsaved work. Use the native application menus for the same commands and
            your customized shortcuts.
          </p>
          <h3 className="demo-subheading">Deep-link examples</h3>
          <code className="demo-link">{appInfo?.protocol}://open/home</code>
          <code className="demo-link">{appInfo?.protocol}://open/settings</code>
          {tasks[0] ? (
            <code className="demo-link">
              {appInfo?.protocol}://open/tasks/{tasks[0].id}
            </code>
          ) : null}
          <p className="demo-note">
            Open these from outside the app after protocol registration. Task links work only while that task is
            retained.
          </p>
        </DemoPanel>
      </div>
    </div>
  );
}
