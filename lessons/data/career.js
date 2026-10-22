// lessons/data/career.js (스텁, 채우는 작업: 클라우드 F4 커리어 레슨 6편. 지시문 docs/cloud-tasks/F4.md)
// 커리어 레슨 등록부 CAREER_LESSONS(여정 LESSONS와 따로, 노드 연결 없음). 항목 형식은 README 8절 레슨과 같고
// id 'c-01'~'c-06', node 'career', career: true. LessonPlayer.start가 객체를 받는 분기(F4)로 연다.
//   c-01 뱅크롤 관리, c-02 스테이크 오르내리기, c-03 테이블 선택, c-04 틸트와 세션 중단, c-05 토너먼트 기본, c-06 ICM 맛보기(참고)
// 완료는 onDone에서 CareerContract.emit('lesson:done', { id })로 알린다(커리어 상태 lessons[id]에 기록, 장소 해금 조건).
var CAREER_LESSONS = [];
