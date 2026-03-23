# Используем легкий образ Nginx
FROM nginx:alpine

# Копируем всё содержимое твоего репозитория в папку, которую обслуживает Nginx
COPY . /usr/share/nginx/html

# Открываем 80-й порт
EXPOSE 80

# Запускаем Nginx
CMD ["nginx", "-g", "daemon off;"]
