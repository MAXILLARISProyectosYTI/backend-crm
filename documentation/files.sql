CREATE TABLE public.files (
	id serial4 NOT NULL,
	parent_id varchar(255) NOT NULL,
	parent_type varchar(100) NOT NULL,
	file_name varchar(255) NOT NULL,
	created_at timestamp DEFAULT now() NULL,
	file_content bytea NULL,
	CONSTRAINT files_pkey PRIMARY KEY (id)
);