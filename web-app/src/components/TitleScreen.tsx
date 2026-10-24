interface TitleScreenProps {
  backgroundUrl?: string;
  onNew: () => void;
  onContinue: () => void;
  onPictures: () => void;
  onScenes: () => void;
  onMusic: () => void;
  onSettings: () => void;
  onQuit: () => void;
}

export default function TitleScreen({
  backgroundUrl,
  onNew,
  onContinue,
  onPictures,
  onScenes,
  onMusic,
  onSettings,
  onQuit,
}: TitleScreenProps) {
  return (
    <div className="title-screen" onClick={(ev) => ev.stopPropagation()}>
      {backgroundUrl && <img className="title-bg" src={backgroundUrl} alt="御魂 ～忍～" />}
      <button className="title-hit start" onClick={onNew} aria-label="任務開始" />
      <button className="title-hit continue" onClick={onContinue} aria-label="任務再開" />
      <button className="title-hit pictures" onClick={onPictures} aria-label="絵巻鑑賞" />
      <button className="title-hit scenes" onClick={onScenes} aria-label="回想閲覧" />
      <button className="title-hit music" onClick={onMusic} aria-label="音楽再生" />
      <button className="title-hit settings" onClick={onSettings} aria-label="環境設定" />
      <button className="title-hit quit" onClick={onQuit} aria-label="終了" />
    </div>
  );
}
