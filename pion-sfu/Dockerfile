FROM golang:1.24-bullseye

WORKDIR /app

# Cache dependencies
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build SFU binary
RUN go build -o sfu .

# WebRTC UDP port
EXPOSE 50000/udp

# For local development you can keep 127.0.0.1.
# For remote clients, change IP to your public/server IP.
CMD ["./sfu", "-port", "50000", "-ip", "127.0.0.1"]

