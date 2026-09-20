import BottomTabs from "@/components/BottomTabs";
import DocSubmitList from "@/components/DocSubmitList";

export default function PreviewIndexPage() {
  return (
    <div className="tab-page">
      <header className="app-header">
        <h1 className="app-header__title">양압기 서류계약</h1>
        <p className="app-header__desc">
          아래의 서식들을 작성하여 제출하시면 자동으로 환자 보기에서 환자명으로 폴더가 만들어
          집니다.
        </p>
      </header>
      <div className="tab-page__body">
        <DocSubmitList patientId="preview-patient" preview />
      </div>
      <BottomTabs />
    </div>
  );
}
