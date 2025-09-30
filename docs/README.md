# 📚 ROIPLATFORM V2 문서 디렉토리

이 디렉토리에는 ROIPLATFORM V2 프로젝트와 관련된 모든 문서가 포함되어 있습니다.

## 📋 문서 목록

### 🎯 프로젝트 요구사항
- **[ROIPLATFORM_PRD_multitenant_MSA_v2.0.md](./ROIPLATFORM_PRD_multitenant_MSA_v2.0.md)**
  - 프로젝트 요구사항 정의서 (PRD)
  - 멀티테넌트 MSA 아키텍처 설계
  - 시스템 요구사항 및 기능 명세

### 🔧 개발환경 설정
- **[WINDOWS_DEV_ENVIRONMENT_SETUP_GUIDE.md](./WINDOWS_DEV_ENVIRONMENT_SETUP_GUIDE.md)**
  - **⭐ 표준 개발환경 구성 가이드**
  - Windows 기반 풀스택 개발환경 설정
  - Java, Maven, Node.js, PostgreSQL, Redis, Git 설치 및 설정
  - 자동화 스크립트 및 트러블슈팅 가이드
  - **모든 신규 프로젝트에서 참조하는 표준 문서**

- **[DEV_SETUP_GUIDE.md](./DEV_SETUP_GUIDE.md)**
  - 프로젝트별 개발환경 설정 가이드
  - 로컬 개발 서버 실행 방법

- **[DEV_ENVIRONMENT_REPORT.md](./DEV_ENVIRONMENT_REPORT.md)**
  - 개발환경 검증 보고서
  - 설치된 구성 요소의 상태 및 버전 정보

### 🎨 UI/UX 문서
- **[UI-마크다운-2025-09-30.md](./UI-마크다운-2025-09-30.md)**
  - UI 컴포넌트 및 디자인 관련 문서

### 🔍 품질 보장 및 검토
- **[DEVELOPMENT_CHECKLIST.md](./DEVELOPMENT_CHECKLIST.md)**
  - **⭐ 표준 개발 완료 후 검토 체크리스트**
  - UI/UX, 백엔드 API, 데이터베이스, 보안, 성능 검토
  - 웹접근성 (WCAG 2.1 AA) 준수 체크
  - 시큐어 코딩 및 명명 규칙 가이드
  - 코드 품질 및 리뷰 체크포인트
  - **모든 기능 구현 완료 후 필수 체크**

## 🚀 빠른 시작

### 새로운 개발자를 위한 환경 설정
1. **[WINDOWS_DEV_ENVIRONMENT_SETUP_GUIDE.md](./WINDOWS_DEV_ENVIRONMENT_SETUP_GUIDE.md)** 문서를 참고하여 표준 개발환경을 구성합니다.
2. 루트 디렉토리의 `setup-development-environment.ps1` 스크립트를 실행하여 자동 설치를 진행합니다.
3. `verify-development-environment.ps1` 스크립트로 환경 설정을 검증합니다.
4. **[DEV_SETUP_GUIDE.md](./DEV_SETUP_GUIDE.md)** 문서를 참고하여 프로젝트별 설정을 완료합니다.

### 품질 보장 워크플로우
1. **기능 개발**: 요구사항에 따른 기능 구현
2. **품질 검토**: **[DEVELOPMENT_CHECKLIST.md](./DEVELOPMENT_CHECKLIST.md)** 체크리스트로 종합 검토
3. **이슈 해결**: 발견된 문제점 보완 및 재검토
4. **최종 승인**: 모든 체크 항목 통과 후 배포 준비

### 프로젝트 이해
1. **[ROIPLATFORM_PRD_multitenant_MSA_v2.0.md](./ROIPLATFORM_PRD_multitenant_MSA_v2.0.md)** 문서를 읽고 프로젝트 요구사항을 파악합니다.
2. 시스템 아키텍처 및 기능 명세를 검토합니다.

## 📝 문서 관리 규칙

### 파일명 규칙
- 영문 대문자로 시작
- 단어 구분은 언더스코어(`_`) 사용
- 날짜가 포함된 경우 `YYYY-MM-DD` 형식 사용

### 문서 업데이트
- 주요 변경사항은 문서 상단의 버전 히스토리에 기록
- 작성자 및 최종 수정일 명시
- 관련 문서 간 상호 참조 유지

### 새 문서 추가
- 새로운 문서는 이 README에 추가하여 목록 최신화
- 문서의 목적과 대상 독자를 명확히 설명
- 적절한 카테고리에 분류

## 🔗 관련 파일

### 루트 디렉토리 스크립트
- `setup-development-environment.ps1` - 개발환경 자동 설정 스크립트
- `verify-development-environment.ps1` - 개발환경 검증 스크립트

### 설정 파일
- 각 서비스별 설정 파일들은 해당 서비스 디렉토리에 위치

---

**관리자**: Development Team  
**최종 수정**: 2025-09-30  
**문서 버전**: 1.0