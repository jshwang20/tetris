# Docker & Docker Compose 설치 가이드 (WSL2 Ubuntu)

MySQL을 Docker Compose로 실행하기 위한 사전 설치 가이드.

---

## 1. Docker Engine 설치

```bash
# 기존 패키지 제거
sudo apt remove -y docker docker-engine docker.io containerd runc

# 의존성 설치
sudo apt update
sudo apt install -y ca-certificates curl gnupg lsb-release

# Docker 공식 GPG 키 추가
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Docker 저장소 등록
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Docker Engine + Compose 플러그인 설치
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
```

---

## 2. sudo 없이 Docker 실행 (권장)

```bash
sudo usermod -aG docker $USER

# WSL2는 logout/login 대신 아래 명령으로 즉시 적용
newgrp docker
```

---

## 3. Docker 데몬 시작 (WSL2 전용)

WSL2는 systemd가 기본 비활성화 상태일 수 있어 수동으로 데몬을 시작해야 한다.

```bash
sudo service docker start
```

부팅마다 자동 시작하려면 `~/.bashrc` (또는 `~/.zshrc`)에 추가:

```bash
# ~/.bashrc 끝에 추가
if [ "$(sudo service docker status 2>&1)" != " * Docker is running" ]; then
  sudo service docker start > /dev/null 2>&1
fi
```

> **WSL2에서 systemd를 활성화한 경우** (`/etc/wsl.conf`에 `systemd=true` 설정)라면
> `sudo service docker start` 대신 `sudo systemctl enable --now docker`를 사용한다.

---

## 4. 설치 확인

```bash
docker --version
# Docker version 27.x.x, build ...

docker compose version
# Docker Compose version v2.x.x

docker run --rm hello-world
# Hello from Docker! 메시지 출력되면 정상
```

---

## 5. MySQL 컨테이너 실행 (프로젝트 루트에서)

```bash
# 프로젝트 루트로 이동
cd /path/to/tetris

# 백그라운드로 MySQL 시작
docker compose up -d

# 컨테이너 상태 확인 (STATUS가 healthy 가 될 때까지 대기)
docker compose ps

# MySQL 접속 테스트
docker exec -it tetris_mysql mysql -u tetris -ptetrispassword tetris
```

---

## 6. 자주 쓰는 명령어

```bash
docker compose up -d          # 컨테이너 시작 (백그라운드)
docker compose down           # 컨테이너 중지 및 제거 (볼륨 유지)
docker compose down -v        # 컨테이너 + 볼륨 모두 삭제 (데이터 초기화)
docker compose logs -f db     # MySQL 로그 실시간 확인
docker compose ps             # 컨테이너 상태 확인
```

---

## 다음 단계

Docker 설치 완료 후 [MYSQL.md](./MYSQL.md)의 작업 체크리스트를 순서대로 진행한다.
