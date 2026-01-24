FROM grafana/k6:latest

WORKDIR /scripts

# Copy the test script
COPY payment-tps-test.js .

# Allow passing the API URL as an environment variable (default provided in script)
ENV API_URL=http://host.docker.internal:8080

CMD ["run", "payment-tps-test.js"]
