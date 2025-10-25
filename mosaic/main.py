import cv2
import os
import re
import numpy as np
import argparse

# =========================
# 設定パラメータ
# =========================

# 顔検出で使う分類器（OpenCV付属のHaar Cascade）
# ※ OpenCVのインストール環境によってはパスが異なる場合があります。
#   cv2.data.haarcascades で標準のカスケード分類器ディレクトリを指せるようにしています。
FACE_CASCADE_PATH = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"

# モザイクの強さ（数値が小さいほど荒く＝よく隠れる）
MOSAIC_RATIO = 0.03  # 3%まで縮小してから拡大し直すイメージ。必要に応じて調整。

# 出力先ルートディレクトリ名
OUTPUT_DIRNAME = "_anonymized"

# 対象とする拡張子（小文字に正規化して比較する）
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}

# OCRを使用するかどうか（テキスト検出）
USE_OCR = True

# OCR検出の信頼度閾値（0.0～1.0、値が高いほど確実なもののみ検出）
OCR_CONFIDENCE_THRESHOLD = 0.4  # デフォルト: 0.4

# テキスト検出の設定（名前など）
# 特定のテキストを検出したい場合はここに追加
# 例: ["山田", "太郎", "鈴木", "花子", "Smith", "김철수", "王小明"]
# 空リストの場合は、指定長さの範囲内の任意の文字列（日本語、英語、韓国語など）を検出対象とする
TARGET_NAMES = ["浅野", "友哉", "asano", "yuya", "yuuya"]

# OCRで検出するテキストの最小・最大長
NAME_MIN_LENGTH = 2
NAME_MAX_LENGTH = 4

# 日付検出を有効にするか（誕生日、有効期限、発行日など全ての日付）
DETECT_DATE = True

# モザイク範囲のマージン（検出範囲の何%拡大するか）
MOSAIC_MARGIN_RATIO = 0.20  # 20%のマージン

# ごま塩ノイズを追加するか
ADD_SALT_PEPPER_NOISE = True

# ごま塩ノイズの密度（0.0～1.0、値が大きいほどノイズが多い）
NOISE_AMOUNT = 0.10  # 10%のピクセルにノイズを追加


# =========================
# ユーティリティ関数
# =========================


def list_images_recursively(root_dir):
    """
    root_dir以下のすべてのファイルから、対象拡張子の画像だけをリストアップして返す。
    戻り値はファイルパスのリスト（絶対パス）。
    """
    image_paths = []
    for dirpath, _, filenames in os.walk(root_dir):
        for filename in filenames:
            _, ext = os.path.splitext(filename)
            if ext.lower() in IMAGE_EXTS:
                full_path = os.path.join(dirpath, filename)
                image_paths.append(os.path.abspath(full_path))
    return image_paths


def ensure_output_path(input_path, root_dir, output_root):
    """
    入力ファイル input_path が root_dir のどこにあるかに応じて、
    output_root 以下に同じ階層構造で保存するための出力パスを返す。

    例:
      root_dir = /home/user/photos
      output_root = /home/user/photos/_anonymized
      input_path = /home/user/photos/cert/abc.jpg
    -> /home/user/photos/_anonymized/cert/abc.jpg
    """
    rel_path = os.path.relpath(input_path, root_dir)
    out_path = os.path.join(output_root, rel_path)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    return out_path


def add_margin_to_bbox(
    x, y, w, h, img_height, img_width, margin_ratio=MOSAIC_MARGIN_RATIO
):
    """
    検出領域にマージンを追加する。
    画像の境界を超えないように調整する。
    """
    margin_w = int(w * margin_ratio)
    margin_h = int(h * margin_ratio)

    new_x = max(0, x - margin_w)
    new_y = max(0, y - margin_h)
    new_w = min(img_width - new_x, w + 2 * margin_w)
    new_h = min(img_height - new_y, h + 2 * margin_h)

    return new_x, new_y, new_w, new_h


def add_salt_pepper_noise(img, amount=NOISE_AMOUNT):
    """
    画像にごま塩ノイズを追加する。

    Parameters:
        img: 入力画像（NumPy配列）
        amount: ノイズの密度（0.0～1.0）

    Returns:
        ノイズが追加された画像
    """
    output = img.copy()
    h, w = output.shape[:2]

    # ノイズを追加するピクセル数
    num_noise = int(amount * h * w)

    # 塩ノイズ（白）を追加
    salt_coords_y = np.random.randint(0, h, num_noise // 2)
    salt_coords_x = np.random.randint(0, w, num_noise // 2)
    output[salt_coords_y, salt_coords_x] = 255

    # 胡椒ノイズ（黒）を追加
    pepper_coords_y = np.random.randint(0, h, num_noise // 2)
    pepper_coords_x = np.random.randint(0, w, num_noise // 2)
    output[pepper_coords_y, pepper_coords_x] = 0

    return output


def mosaic_region(
    img,
    x,
    y,
    w,
    h,
    ratio=MOSAIC_RATIO,
    add_margin=True,
    add_noise=ADD_SALT_PEPPER_NOISE,
):
    """
    画像imgの矩形領域(x,y,w,h)に強いモザイクをかける。
    ratioは縮小率。0.07なら7%サイズに縮小→拡大。
    add_marginがTrueの場合、検出範囲にマージンを追加する。
    add_noiseがTrueの場合、モザイク前にごま塩ノイズを追加する。
    """
    # マージンを追加
    if add_margin:
        img_height, img_width = img.shape[:2]
        x, y, w, h = add_margin_to_bbox(x, y, w, h, img_height, img_width)

    # 領域の切り出し
    roi = img[y : y + h, x : x + w]

    # ごま塩ノイズを追加
    if add_noise:
        roi = add_salt_pepper_noise(roi)

    # 縮小サイズを計算（最小1ピクセルは避ける）
    small_w = max(1, int(w * ratio))
    small_h = max(1, int(h * ratio))

    # 縮小→拡大（最近傍補間でブロック状にする）
    roi_small = cv2.resize(roi, (small_w, small_h), interpolation=cv2.INTER_LINEAR)
    roi_mosaic = cv2.resize(roi_small, (w, h), interpolation=cv2.INTER_NEAREST)

    # 元画像に貼り戻す
    img[y : y + h, x : x + w] = roi_mosaic
    return img


def detect_faces(img, face_cascade):
    """
    顔領域を検出して [(x,y,w,h), ...] のリストで返す。
    """
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # detectMultiScaleのパラメータは状況に応じて調整
    faces = face_cascade.detectMultiScale(
        gray, scaleFactor=1.2, minNeighbors=5, minSize=(40, 40)
    )
    return faces


def is_text_candidate(text):
    """
    テキストが検出対象かどうかを判定する（名前、単語など）。

    判定基準:
    - 指定された名前リスト(TARGET_NAMES)に含まれている（英文字は大文字小文字を区別しない）
    - または、指定長さの範囲内の任意のUTF-8文字列（日本語、英語、韓国語、中国語など）
    """
    text = text.strip()

    # 指定された名前リストに含まれているか（大文字小文字を区別しない比較）
    if TARGET_NAMES:
        # 英文字を含む場合は大文字小文字を区別しない
        text_lower = text.lower()
        for target_name in TARGET_NAMES:
            if text == target_name or text_lower == target_name.lower():
                return True

    # 長さのチェック
    if len(text) < NAME_MIN_LENGTH or len(text) > NAME_MAX_LENGTH:
        return False

    # 任意のUTF-8文字列を検出対象として扱う
    # 記号や数字のみの文字列は除外（少なくとも1文字は文字（Letter）を含む）
    has_letter = any(c.isalpha() for c in text)

    return has_letter


def is_date_candidate(text):
    """
    テキストが日付候補かどうかを判定する。

    検出パターン:
    - 西暦: 2000年1月1日, 2000年 1月 1日, 2000/1/1, 2000.1.1, 2000-1-1
    - 和暦: 令和5年1月1日, 令和 5年 1月 1日, R5.1.1, 平成元年, 昭和, 大正, 明治
    - 英語: 27 Jun. 2023, June 27 2023, 27-Jun-2023, Jun 27, 2023
    - 年月のみ: 2000年1月, 2000/1
    - 誕生日、有効期限、発行日など全ての日付形式を検出
    - スペースが入っている場合も検出
    """
    text = text.strip()

    # スペースを削除して検出する（スペース入りの日付に対応）
    text_no_space = text.replace(" ", "").replace("　", "")  # 半角・全角スペースを削除

    # 西暦パターン（1900-2099年）
    # 例: 2000年1月1日, 2000年 1月 1日, 2000/1/1, 2000.1.1, 2000-1-1
    western_patterns = [
        r"(19|20)\d{2}[年/\.\-\s　]+(0?[1-9]|1[0-2])[月/\.\-\s　]+(0?[1-9]|[12][0-9]|3[01])日?",  # 年月日（スペース許容）
        r"(19|20)\d{2}[年/\.\-\s　]+(0?[1-9]|1[0-2])月?",  # 年月（スペース許容）
    ]

    # 和暦パターン
    # 例: 令和5年1月1日, 令和 5年 1月 1日, R5.1.1, 平成元年, 昭和64年
    japanese_era_patterns = [
        r"(令和|平成|昭和|大正|明治)[\s　]*[元0-9]{1,2}年[\s　]*(0?[1-9]|1[0-2])月[\s　]*(0?[1-9]|[12][0-9]|3[01])日",  # 和暦年月日（スペース許容）
        r"(令和|平成|昭和|大正|明治)[\s　]*[元0-9]{1,2}年[\s　]*(0?[1-9]|1[0-2])月",  # 和暦年月（スペース許容）
        r"(令和|平成|昭和|大正|明治)[\s　]*[元0-9]{1,2}年",  # 和暦年のみ（スペース許容）
        r"[RHMST][\s　]*[0-9]{1,2}[/\.\-\s　]+(0?[1-9]|1[0-2])[/\.\-\s　]+(0?[1-9]|[12][0-9]|3[01])",  # 略記（R5.1.1）（スペース許容）
        r"[RHMST][\s　]*[0-9]{1,2}[/\.\-\s　]+(0?[1-9]|1[0-2])",  # 略記年月（R5.1）（スペース許容）
    ]

    # 英語の日付パターン
    # 月名（完全名と略称、大文字小文字を区別しない）
    months = r"(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t)?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)"

    # 例: 27 Jun. 2023, 27 June 2023, Jun. 27 2023, June 27, 2023, 27-Jun-2023
    english_date_patterns = [
        # 日 月 年 形式: 27 Jun. 2023, 27 June 2023, 27-Jun-2023
        rf"(0?[1-9]|[12][0-9]|3[01])[\s\-\.]+{months}\.?[\s\-\.,]+(19|20)\d{{2}}",
        # 月 日, 年 形式: Jun. 27, 2023, June 27 2023
        rf"{months}\.?[\s\-\.]+([1-9]|[12][0-9]|3[01])[\s\-\.,]+(19|20)\d{{2}}",
        # 月 日 形式（年なし）: Jun. 27, June 27
        rf"{months}\.?[\s\-\.]+([1-9]|[12][0-9]|3[01])(?![\d])",
        # 日 月 形式（年なし）: 27 Jun., 27 June
        rf"(0?[1-9]|[12][0-9]|3[01])[\s\-\.]+{months}\.?(?![\d])",
    ]

    all_patterns = western_patterns + japanese_era_patterns + english_date_patterns

    # 元のテキストとスペースを削除したテキストの両方でチェック（大文字小文字を区別しない）
    for pattern in all_patterns:
        if re.search(pattern, text, re.IGNORECASE) or re.search(pattern, text_no_space, re.IGNORECASE):
            return True

    return False


def detect_text_regions(img, reader):
    """
    OCRでテキスト領域を検出し、テキスト候補と日付候補の矩形領域を返す。

    Returns:
        name_regions: テキスト候補の矩形領域リスト [(x,y,w,h), ...]（名前など）
        detected_names: 検出されたテキストのリスト
        date_regions: 日付候補の矩形領域リスト [(x,y,w,h), ...]
        detected_dates: 検出された日付のリスト
    """
    try:
        # EasyOCRでテキストを検出（日本語・英語に最適化したパラメータ）
        results = reader.readtext(
            img,
            detail=1,  # 詳細情報（bbox、テキスト、信頼度）を取得
            paragraph=False,  # 単語単位で検出（名前検出に適している）
            min_size=10,  # 最小検出サイズ（小さすぎるテキストを除外）
            text_threshold=0.7,  # テキスト検出の信頼度閾値
            low_text=0.4,  # テキストリンクの閾値
            link_threshold=0.4,  # リンク閾値
            canvas_size=2560,  # キャンバスサイズ（大きい画像に対応）
            mag_ratio=1.5,  # 拡大率
        )

        name_regions = []
        detected_names = []
        date_regions = []
        detected_dates = []

        for detection in results:
            bbox, text, confidence = detection

            # 信頼度が低い場合はスキップ
            if confidence < OCR_CONFIDENCE_THRESHOLD:
                continue

            # bboxは[[x1,y1], [x2,y2], [x3,y3], [x4,y4]]の形式
            # 矩形領域を計算
            xs = [point[0] for point in bbox]
            ys = [point[1] for point in bbox]
            x_min, x_max = int(min(xs)), int(max(xs))
            y_min, y_max = int(min(ys)), int(max(ys))

            w = x_max - x_min
            h = y_max - y_min

            # 日付候補かどうかを判定（日付を優先）
            if DETECT_DATE and is_date_candidate(text):
                date_regions.append((x_min, y_min, w, h))
                detected_dates.append(text)
            # テキスト候補かどうかを判定（名前など）
            elif is_text_candidate(text):
                name_regions.append((x_min, y_min, w, h))
                detected_names.append(text)

        return name_regions, detected_names, date_regions, detected_dates

    except Exception as e:
        print(f"[WARN] OCR処理でエラーが発生しました: {e}")
        return [], [], [], []


def strip_exif_and_save(bgr_img, out_path):
    """
    EXIF等のメタデータを落とすため、OpenCVのimwriteでそのまま保存する。
    OpenCVのimwriteは基本的にEXIF等を引き継がないので、
    これで「撮影場所」などのメタデータを除去できる。
    """
    cv2.imwrite(out_path, bgr_img)


# =========================
# メイン処理
# =========================


def process_image_file(img_path, face_cascade, ocr_reader, output_root, root_dir):
    """
    1枚の画像について:
    - 読み込み
    - 顔検出
    - テキスト検出（名前など）・日付検出
    - 検出された領域にモザイク
    - 出力用パスを決定
    - EXIFを落として保存
    """
    img = cv2.imread(img_path)
    if img is None:
        print(f"[WARN] 画像を読み込めませんでした: {img_path}")
        return

    # 顔検出
    faces = detect_faces(img, face_cascade)

    # 検出された顔それぞれにモザイク（マージン付き）
    for x, y, w, h in faces:
        img = mosaic_region(img, x, y, w, h, ratio=MOSAIC_RATIO, add_margin=True)

    # テキスト検出（名前など）・日付検出
    name_regions = []
    detected_names = []
    date_regions = []
    detected_dates = []

    if USE_OCR and ocr_reader is not None:
        name_regions, detected_names, date_regions, detected_dates = (
            detect_text_regions(img, ocr_reader)
        )

        # 検出されたテキスト領域それぞれにモザイク（マージン付き）
        for x, y, w, h in name_regions:
            img = mosaic_region(img, x, y, w, h, ratio=MOSAIC_RATIO, add_margin=True)

        # 検出された日付領域それぞれにモザイク（マージン付き）
        for x, y, w, h in date_regions:
            img = mosaic_region(img, x, y, w, h, ratio=MOSAIC_RATIO, add_margin=True)

    # 保存先パスを作る
    out_path = ensure_output_path(
        input_path=img_path, root_dir=root_dir, output_root=output_root
    )

    strip_exif_and_save(img, out_path)

    # ログ
    total_detections = len(faces) + len(name_regions) + len(date_regions)
    if total_detections == 0:
        print(f"[INFO] 検出なし: {img_path} -> {out_path}")
    else:
        log_parts = []
        if len(faces) > 0:
            log_parts.append(f"顔{len(faces)}件")
        if len(name_regions) > 0:
            names_str = "、".join(detected_names[:3])  # 最初の3件まで表示
            if len(detected_names) > 3:
                names_str += "..."
            log_parts.append(f"テキスト{len(name_regions)}件({names_str})")
        if len(date_regions) > 0:
            dates_str = "、".join(detected_dates[:2])  # 最初の2件まで表示
            if len(detected_dates) > 2:
                dates_str += "..."
            log_parts.append(f"日付{len(date_regions)}件({dates_str})")

        print(f"[INFO] {' / '.join(log_parts)}をモザイク: {img_path} -> {out_path}")


def main():
    # コマンドライン引数のパース
    parser = argparse.ArgumentParser(
        description="画像内の顔、名前、日付を自動検出してモザイク処理を行います。",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
使用例:
  # カレントディレクトリを処理
  python main.py

  # 特定のディレクトリを処理
  python main.py C:\\Users\\user\\Pictures
  python main.py /path/to/images

  # 出力先を指定
  python main.py C:\\Users\\user\\Pictures -o C:\\Users\\user\\Output
        """,
    )
    parser.add_argument(
        "target_dir",
        nargs="?",
        default=None,
        help="処理する画像があるディレクトリのパス（省略した場合はカレントディレクトリ）",
    )
    parser.add_argument(
        "-o",
        "--output",
        dest="output_dir",
        default=None,
        help=f"出力先ディレクトリのパス（省略した場合は target_dir/{OUTPUT_DIRNAME}）",
    )

    args = parser.parse_args()

    # ベースディレクトリの決定
    if args.target_dir:
        root_dir = os.path.abspath(args.target_dir)
        if not os.path.exists(root_dir):
            print(f"[ERROR] 指定されたディレクトリが存在しません: {root_dir}")
            return
        if not os.path.isdir(root_dir):
            print(f"[ERROR] 指定されたパスはディレクトリではありません: {root_dir}")
            return
    else:
        # 引数が指定されない場合はカレントディレクトリ
        root_dir = os.getcwd()

    print(f"[INFO] 処理対象ディレクトリ: {root_dir}")

    # 出力用のルートディレクトリ
    if args.output_dir:
        output_root = os.path.abspath(args.output_dir)
    else:
        output_root = os.path.join(root_dir, OUTPUT_DIRNAME)

    os.makedirs(output_root, exist_ok=True)
    print(f"[INFO] 出力先ディレクトリ: {output_root}")

    # 顔検出器のロード
    face_cascade = cv2.CascadeClassifier(FACE_CASCADE_PATH)
    if face_cascade.empty():
        raise RuntimeError(
            f"顔分類器をロードできませんでした: {FACE_CASCADE_PATH}\n"
            "OpenCVのインストールを確認してください。"
        )

    # OCRリーダーの初期化
    ocr_reader = None
    if USE_OCR:
        try:
            import easyocr

            print("[INFO] OCRリーダーを初期化しています（初回は時間がかかります）...")
            # 日本語と英語に最適化した設定
            ocr_reader = easyocr.Reader(
                ["ja", "en"],
                gpu=False,
                model_storage_directory=None,  # デフォルトの場所にモデルを保存
                download_enabled=True,  # モデルの自動ダウンロードを有効化
                detector=True,  # テキスト検出を有効化
                recognizer=True,  # テキスト認識を有効化
                verbose=False,  # 詳細ログを抑制
            )
            print("[INFO] OCRリーダーの初期化が完了しました。")
            print(f"[INFO] OCR信頼度閾値: {OCR_CONFIDENCE_THRESHOLD}")
        except ImportError:
            print(
                "[WARN] easyocrがインストールされていません。テキスト検出をスキップします。"
            )
            print("[WARN] インストールするには: pip install easyocr")
        except Exception as e:
            print(f"[WARN] OCRリーダーの初期化に失敗しました: {e}")
            print("[WARN] テキスト検出をスキップします。")

    # 処理対象の画像ファイル一覧を再帰的に取得
    all_images = list_images_recursively(root_dir)

    # 出力先ルート自身（_anonymized配下）は再処理しないように除外
    all_images = [
        p for p in all_images if not os.path.commonpath([p, output_root]) == output_root
    ]

    if not all_images:
        print("[INFO] 処理対象となる画像が見つかりませんでした。")
        return

    print(f"[INFO] {len(all_images)}枚の画像を処理します。")
    for img_path in all_images:
        process_image_file(
            img_path=img_path,
            face_cascade=face_cascade,
            ocr_reader=ocr_reader,
            output_root=output_root,
            root_dir=root_dir,
        )

    print("[INFO] 完了しました。出力は '_anonymized' フォルダ以下に保存されています。")


if __name__ == "__main__":
    main()
