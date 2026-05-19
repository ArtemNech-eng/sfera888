FROM node:22-alpine

# Install Railway CLI
RUN npm install -g @railway/cli

WORKDIR /app

# Copy package files
COPY package.json tsconfig.json ./
RUN npm install

# Copy source code
COPY agents/ ./agents/
COPY prompts/ ./prompts/

# Create reports directory
RUN mkdir -p reports

# Run the agent
CMD ["npm", "start"]
