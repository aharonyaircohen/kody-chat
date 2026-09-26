FROM linkstackorg/linkstack:latest

USER root
COPY --chown=apache:apache . /htdocs
RUN mv /htdocs/INSTALLING /htdocs/INSTALLING.disabled && \
    mkdir -p /htdocs/storage/app /htdocs/database/seeders/assets && \
    touch /htdocs/storage/app/ISINSTALLED && \
    chmod +x /htdocs/docker-start.sh && \
    chown -R apache:apache /htdocs

USER apache:apache
WORKDIR /htdocs
CMD ["/htdocs/docker-start.sh"]
