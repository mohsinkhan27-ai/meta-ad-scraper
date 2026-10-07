# Use the official Microsoft Playwright image which includes all browser dependencies
FROM mcr.microsoft.com/playwright:v1.49.0-jammy

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node dependencies and ensure Chromium is installed
RUN npm install
RUN npx playwright install chromium

# Copy the rest of the application files
COPY . .

# Set environment variables
ENV PORT=3000
ENV NODE_ENV=production

# Expose server port
EXPOSE 3000

# Start the application
CMD ["node", "server.js"]
