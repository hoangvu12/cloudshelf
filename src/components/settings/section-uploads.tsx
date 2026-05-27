import { usePrefsStore } from "@/stores/prefs";
import { SectionShell } from "./section-shell";
import { Segmented, SettingRow, SettingToggleRow, SliderRow } from "./rows";

const MB = 1024 * 1024;
const PART_SIZE_OPTIONS = [8 * MB, 16 * MB, 32 * MB, 64 * MB];

export function UploadsSection() {
  const partSize = usePrefsStore((s) => s.multipartPartSize);
  const concurrentUploads = usePrefsStore((s) => s.concurrentUploads);
  const concurrentParts = usePrefsStore((s) => s.concurrentParts);
  const overwriteWarning = usePrefsStore((s) => s.overwriteWarning);
  const resumeOnReload = usePrefsStore((s) => s.resumeOnReload);
  const compressImages = usePrefsStore((s) => s.compressImages);
  const patch = usePrefsStore((s) => s.patch);

  return (
    <SectionShell title="Transfer settings">
      <SettingRow
        label="Multipart chunk size"
        description="Size of parts for large file uploads."
        control={
          <Segmented<number>
            value={partSize}
            onChange={(v) => patch({ multipartPartSize: v })}
            options={PART_SIZE_OPTIONS.map((bytes) => ({
              value: bytes,
              label: `${bytes / MB} MB`,
            }))}
          />
        }
      />

      <SliderRow
        label="Concurrent uploads"
        description="Max number of files uploading at once."
        min={2}
        max={8}
        value={concurrentUploads}
        onChange={(v) => patch({ concurrentUploads: v })}
      />

      <SliderRow
        label="Concurrent parts per upload"
        description="Parallel connections per multipart file."
        min={2}
        max={8}
        value={concurrentParts}
        onChange={(v) => patch({ concurrentParts: v })}
      />

      <div className="border-border space-y-6 border-t pt-6">
        <SettingToggleRow
          label="Overwrite warning"
          description="Prompt before overwriting existing files."
          checked={overwriteWarning}
          onChange={(v) => patch({ overwriteWarning: v })}
        />
        <SettingToggleRow
          label="Resume re-added files"
          description="When you re-add the same file after a refresh, skip parts that already uploaded."
          checked={resumeOnReload}
          onChange={(v) => patch({ resumeOnReload: v })}
        />
        <SettingToggleRow
          label="Compress images before upload"
          description="Re-encodes JPEG/PNG/WEBP images at 80% quality to save bandwidth and storage. Originals on disk are untouched. Off by default — your uploads stay pixel-perfect."
          checked={compressImages}
          onChange={(v) => patch({ compressImages: v })}
        />
      </div>
    </SectionShell>
  );
}
